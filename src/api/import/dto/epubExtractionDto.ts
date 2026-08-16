export interface EpubExtractionDto {
	title: string | null;
	authors: string | null;
	publicationDate: string | null;
	html: string;
	chapterCount: number;
}
