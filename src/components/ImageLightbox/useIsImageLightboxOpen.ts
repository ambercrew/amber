import { lightboxStore, useLightboxStore } from "@mantine/lightbox";

export function useIsImageLightboxOpen() {
	return useLightboxStore(lightboxStore).opened;
}
