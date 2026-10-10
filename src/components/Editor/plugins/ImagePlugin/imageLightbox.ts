import { Lightbox } from "@mantine/lightbox";
import { resolveImageSrc } from "../../../../utils/assetUrl";

export function openImageLightbox(src: string, altText: string) {
	Lightbox.open({ slides: [{ src: resolveImageSrc(src), alt: altText }] });
}
