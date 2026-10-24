import { ReactNode } from "react";
import { Center, Loader, Stack, Text } from "@mantine/core";

interface PdfStatusProps {
	/** Shown under a spinner while loading. */
	loading?: string;
	/** Shown in red instead, for a failure. */
	error?: string;
	/** Extra explanation under an error. */
	children?: ReactNode;
}

/** Fills the view with a loading or error message while the PDF can't be shown. */
export default function PdfStatus({
	loading,
	error,
	children,
}: PdfStatusProps) {
	return (
		<Center h="100%">
			<Stack align="center" gap="xs" maw={420} ta="center">
				{error ? (
					<Text c="red">{error}</Text>
				) : (
					<>
						<Loader size="md" />
						<Text size="md" c="dimmed">
							{loading}
						</Text>
					</>
				)}
				{children}
			</Stack>
		</Center>
	);
}
