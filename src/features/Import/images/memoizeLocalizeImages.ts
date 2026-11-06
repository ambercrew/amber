import { LocalizedImage, localizeImages } from "./localize";

/** `localizeImages` that downloads and stores each URL once, however many fragments reference it. */
export function memoizeLocalizeImages(): typeof localizeImages {
	const cache = new Map<string, Promise<LocalizedImage>>();
	return async (absoluteUrls, referer) => {
		const missing = absoluteUrls.filter(url => !cache.has(url));
		if (missing.length > 0) {
			const localized = localizeImages(missing, referer);
			for (const url of missing)
				cache.set(
					url,
					localized.then(images => images.get(url)!),
				);
		}
		const entries = await Promise.all(
			absoluteUrls.map(async (url): Promise<[string, LocalizedImage]> => [
				url,
				await cache.get(url)!,
			]),
		);
		return new Map(entries);
	};
}
