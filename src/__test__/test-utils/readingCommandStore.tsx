import { PropsWithChildren } from "react";
import { Provider } from "react-redux";
import {
	ReadingCommand,
	runReadingCommand,
} from "../../commands/readingCommands";
import { AppStore, setupStore } from "../../stores/store";

/** A store for hooks that handle reading commands, its wrapper, and a way to send them one. */
export function createReadingCommandStore(store: AppStore = setupStore()) {
	return {
		store,
		wrapper: ({ children }: PropsWithChildren) => (
			<Provider store={store}>{children}</Provider>
		),
		send: (command: ReadingCommand) => {
			store.dispatch(runReadingCommand(command));
		},
	};
}
