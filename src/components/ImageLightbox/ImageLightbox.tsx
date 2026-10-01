import { Lightbox } from "@mantine/lightbox";
import useBackButtonPress from "../../hooks/useBackButtonPress";
import { BackButtonPriority } from "../../managers/backButtonManager";
import { useIsImageLightboxOpen } from "./useIsImageLightboxOpen";

/** Mounted once in `App.tsx`; open it from anywhere with `Lightbox.open`. */
export default function ImageLightbox() {
	const opened = useIsImageLightboxOpen();
	// It covers everything, modals included, so it should close first.
	useBackButtonPress(() => Lightbox.close(), opened, BackButtonPriority.High);

	// Always a single image, so the arrows and "1 / 1" counter would be noise.
	return (
		<Lightbox.Provider
			withZoom
			closeOnClickOutside
			withNavigation={false}
			styles={{ counter: { display: "none" } }}
		/>
	);
}
