import useAppSelector from "./useAppSelector";
import { selectChromeInsets } from "../stores/app/appSelectors";

/** The space the header and footer take right now; follows them as they hide on scroll, in every view. */
export function useChromeInsets() {
	return useAppSelector(selectChromeInsets);
}
