use std::sync::Arc;

use async_trait::async_trait;
use injector_derive::ScopeInjectable;

use crate::common::repository_error::RepositoryError;
use crate::elements::value_objects::element_id::ElementId;
use crate::search::entities::content_search_results::{
    ContentMatch, ContentSearchResults, ElementContentMatches,
};
use crate::search::repositories::content_search_repository::ContentSearchRepository;
use crate::search::services::content_search_service::ContentSearchService;
use crate::search::utils::text_matches::{
    SEARCH_RESULT_WINDOW, SnippetWindow, find_matches, snippet,
};
use crate::search::value_objects::content_part::ContentPartRef;

/// Matches past this are dropped, keeping the response (and the list rendering it) quick.
pub const MAX_CONTENT_MATCHES: usize = 1000;
/// Texts read per query, so a capped search stops reading early.
const TEXT_BATCH_SIZE: usize = 64;

#[derive(ScopeInjectable)]
pub struct DefaultContentSearchService {
    content_search_repository: Arc<dyn ContentSearchRepository>,
}

#[async_trait]
impl ContentSearchService for DefaultContentSearchService {
    async fn search_content(
        &self,
        query: &str,
        case_sensitive: bool,
        is_superseded: &(dyn Fn() -> bool + Send + Sync),
    ) -> Result<Option<ContentSearchResults>, RepositoryError> {
        let parts = self
            .content_search_repository
            .find_candidate_parts(query, case_sensitive)
            .await?;
        let Some(mut results) = self
            .collect_matches(
                &parts,
                query,
                case_sensitive,
                MAX_CONTENT_MATCHES,
                SEARCH_RESULT_WINDOW,
                is_superseded,
            )
            .await?
        else {
            return Ok(None);
        };
        // Names are read last, only for the elements that made it into the results.
        let element_ids: Vec<_> = results.elements.iter().map(|e| e.element_id).collect();
        let names = self
            .content_search_repository
            .get_names(&element_ids)
            .await?;
        for (element, name) in results.elements.iter_mut().zip(names) {
            element.name = name;
        }
        Ok(Some(results))
    }

    async fn search_element_content(
        &self,
        element_id: ElementId,
        query: &str,
        case_sensitive: bool,
        max_matches: usize,
        window: SnippetWindow,
    ) -> Result<ContentSearchResults, RepositoryError> {
        let parts = self
            .content_search_repository
            .find_element_candidate_parts(element_id, query, case_sensitive)
            .await?;
        let results = self
            .collect_matches(&parts, query, case_sensitive, max_matches, window, &|| {
                false
            })
            .await?;
        Ok(results.expect("never superseded"))
    }

    async fn has_searchable_text(&self, element_id: ElementId) -> Result<bool, RepositoryError> {
        self.content_search_repository.has_text(element_id).await
    }
}

impl DefaultContentSearchService {
    /// Every match in `parts` up to `max_matches`, with element names left empty;
    /// `None` once `is_superseded`, checked before each batch of texts is read.
    async fn collect_matches(
        &self,
        parts: &[ContentPartRef],
        query: &str,
        case_sensitive: bool,
        max_matches: usize,
        window: SnippetWindow,
        is_superseded: &(dyn Fn() -> bool + Send + Sync),
    ) -> Result<Option<ContentSearchResults>, RepositoryError> {
        let mut results = ContentSearchResults::default();
        if query.is_empty() {
            return Ok(Some(results));
        }

        let mut match_count = 0;
        // Matches counted so far in the current element, across its earlier parts.
        let mut element_match_index = 0;

        for batch in parts.chunks(TEXT_BATCH_SIZE) {
            if is_superseded() {
                return Ok(None);
            }
            let texts = self.content_search_repository.get_part_texts(batch).await?;
            for (part, text) in batch.iter().zip(texts) {
                let ranges = find_matches(&text, query, case_sensitive);
                if ranges.is_empty() {
                    continue;
                }
                if match_count == max_matches {
                    results.truncated = true;
                    return Ok(Some(results));
                }

                let same_element = results
                    .elements
                    .last()
                    .is_some_and(|element| element.element_id == part.element_id);
                if !same_element {
                    element_match_index = 0;
                    results.elements.push(ElementContentMatches {
                        element_id: part.element_id,
                        name: String::new(),
                        matches: Vec::new(),
                    });
                }
                let element = results.elements.last_mut().expect("pushed above");

                for range in ranges {
                    if match_count == max_matches {
                        results.truncated = true;
                        return Ok(Some(results));
                    }
                    element.matches.push(ContentMatch {
                        index: element_match_index,
                        snippet: snippet(&text, range, window),
                    });
                    element_match_index += 1;
                    match_count += 1;
                }
            }
        }

        Ok(Some(results))
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use fractional_index::FractionalIndex;
    use injector::injector::Injector;
    use injector::register_scope;
    use uuid::Uuid;

    use crate::elements::entities::card::Card;
    use crate::elements::entities::extract::Extract;
    use crate::elements::repositories::card_repository::CardRepository;
    use crate::elements::repositories::extract_repository::ExtractRepository;
    use crate::elements::repositories::meta_repository::MetaRepository;
    use crate::elements::value_objects::element_id::ElementId;
    use crate::elements::value_objects::meta::Meta;
    use crate::elements::value_objects::name_source::NameSource;
    use crate::infrastructure::repositories::sqlite::sqlite_card_repository::SqliteCardRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_content_search_repository::SqliteContentSearchRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_extract_repository::SqliteExtractRepository;
    use crate::infrastructure::repositories::sqlite::sqlite_meta_repository::SqliteMetaRepository;
    use crate::search::utils::text_matches::Snippet;
    use crate::test_utils::create_test_injector;

    use super::*;

    async fn initialize_test_injector() -> Injector {
        let mut injector = create_test_injector().await;
        register_scope!(injector, dyn MetaRepository, SqliteMetaRepository);
        register_scope!(injector, dyn CardRepository, SqliteCardRepository);
        register_scope!(injector, dyn ExtractRepository, SqliteExtractRepository);
        register_scope!(
            injector,
            dyn ContentSearchRepository,
            SqliteContentSearchRepository
        );
        register_scope!(
            injector,
            dyn ContentSearchService,
            DefaultContentSearchService
        );
        injector
    }

    fn make_meta(element_id: ElementId, name: &str) -> Meta {
        Meta {
            element_id,
            name: name.into(),
            name_source: NameSource::Manual,
            suspended: false,
            parent: None,
            position: FractionalIndex::default(),
            priority: FractionalIndex::default(),
            study_profile_id: None,
            bibliographical_source_id: None,
            derived_from: None,
            created_at: Utc::now(),
            modified_at: Utc::now(),
        }
    }

    fn content_json(text: &str) -> String {
        format!(
            r#"{{"root":{{"children":[{{"type":"paragraph","children":[{{"type":"text","text":"{text}"}}]}}]}}}}"#
        )
    }

    #[tokio::test]
    async fn search_content_card_front_and_back_numbers_matches_across_both() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let card_repository = scope.resolve::<dyn CardRepository>().await;
        let service = scope.resolve::<dyn ContentSearchService>().await;

        let card = Card {
            meta: make_meta(ElementId::Card(Uuid::new_v4()), "Cells"),
            front: content_json("What is a cell wall?"),
            back: content_json("The wall of a cell"),
        };
        let card_id = card.meta.element_id;
        card_repository.create(card).await.unwrap();

        // Act

        let actual = service
            .search_content("WALL", false, &|| false)
            .await
            .unwrap()
            .unwrap();

        // Assert

        assert_eq!(
            ContentSearchResults {
                elements: vec![ElementContentMatches {
                    element_id: card_id,
                    name: "Cells".into(),
                    matches: vec![
                        ContentMatch {
                            index: 0,
                            snippet: Snippet {
                                before: "What is a cell ".into(),
                                text: "wall".into(),
                                after: "?".into(),
                            },
                        },
                        ContentMatch {
                            index: 1,
                            snippet: Snippet {
                                before: "The ".into(),
                                text: "wall".into(),
                                after: " of a cell".into(),
                            },
                        },
                    ],
                }],
                truncated: false,
            },
            actual
        );
    }

    #[tokio::test]
    async fn search_content_more_matches_than_cap_truncates_results() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let extract_repository = scope.resolve::<dyn ExtractRepository>().await;
        let service = scope.resolve::<dyn ContentSearchService>().await;

        extract_repository
            .create(Extract {
                meta: make_meta(ElementId::Extract(Uuid::new_v4()), "Many"),
                content: content_json(&"x ".repeat(MAX_CONTENT_MATCHES + 1)),
                interval_multiplier: 1.2,
            })
            .await
            .unwrap();

        // Act

        let actual = service
            .search_content("x", false, &|| false)
            .await
            .unwrap()
            .unwrap();

        // Assert

        assert!(actual.truncated);
        assert_eq!(MAX_CONTENT_MATCHES, actual.elements[0].matches.len());
    }

    #[tokio::test]
    async fn search_content_cap_reached_at_element_boundary_adds_no_empty_element() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let extract_repository = scope.resolve::<dyn ExtractRepository>().await;
        let service = scope.resolve::<dyn ContentSearchService>().await;

        let first = FractionalIndex::default();
        let second = FractionalIndex::new_after(&first);
        for (name, priority) in [("Full", first), ("Next", second)] {
            let mut meta = make_meta(ElementId::Extract(Uuid::new_v4()), name);
            meta.priority = priority;
            extract_repository
                .create(Extract {
                    meta,
                    content: content_json(&"x ".repeat(MAX_CONTENT_MATCHES)),
                    interval_multiplier: 1.2,
                })
                .await
                .unwrap();
        }

        // Act

        let actual = service
            .search_content("x", false, &|| false)
            .await
            .unwrap()
            .unwrap();

        // Assert

        assert!(actual.truncated);
        assert_eq!(1, actual.elements.len());
    }

    #[tokio::test]
    async fn search_content_empty_query_returns_no_results() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let service = scope.resolve::<dyn ContentSearchService>().await;

        // Act

        let actual = service
            .search_content("", false, &|| false)
            .await
            .unwrap()
            .unwrap();

        // Assert

        assert_eq!(ContentSearchResults::default(), actual);
    }
    #[tokio::test]
    async fn search_content_superseded_returns_none() {
        // Arrange

        let injector = initialize_test_injector().await;
        let scope = injector.start_scope();
        let extract_repository = scope.resolve::<dyn ExtractRepository>().await;
        let service = scope.resolve::<dyn ContentSearchService>().await;

        extract_repository
            .create(Extract {
                meta: make_meta(ElementId::Extract(Uuid::new_v4()), "Wall"),
                content: content_json("wall"),
                interval_multiplier: 1.2,
            })
            .await
            .unwrap();

        // Act

        let actual = service
            .search_content("wall", false, &|| true)
            .await
            .unwrap();

        // Assert

        assert_eq!(None, actual);
    }
}
