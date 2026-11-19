import { Button, Center, Code, Group, Stack, Text, Title } from "@mantine/core";
import { ArrowClockwiseIcon, HouseIcon } from "@phosphor-icons/react";
import { paths } from "../../paths";
import { errorMessage } from "../../utils/describeError";

interface ErrorFallbackProps {
	error: unknown;
}

/** Shown in place of the app after a render error, so a crash never leaves a blank page. */
function ErrorFallback({ error }: ErrorFallbackProps) {
	const message = errorMessage(error);

	return (
		<Center mih="100dvh" p="md">
			<Stack align="center" gap="md" maw={480}>
				<Title order={3}>Something went wrong</Title>
				<Text c="dimmed" ta="center">
					Amber ran into an error and couldn&apos;t show this page.
				</Text>
				<Code block w="100%" style={{ whiteSpace: "pre-wrap" }}>
					{message}
				</Code>
				<Group>
					{/* A full load, as this may render outside the router (and the page itself may be what crashes). */}
					<Button
						leftSection={<HouseIcon />}
						onClick={() => window.location.assign(paths.root())}>
						Go home
					</Button>
					<Button
						variant="default"
						leftSection={<ArrowClockwiseIcon />}
						onClick={() => window.location.reload()}>
						Reload
					</Button>
				</Group>
			</Stack>
		</Center>
	);
}

export default ErrorFallback;
