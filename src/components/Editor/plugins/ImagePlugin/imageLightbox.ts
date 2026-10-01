import { Lightbox } from "@mantine/lightbox";

export function openImageLightbox(src: string, altText: string) {
	Lightbox.open({ slides: [{ src, alt: altText }] });
}
