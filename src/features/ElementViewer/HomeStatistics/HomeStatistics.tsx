import { Alert, Paper, SimpleGrid, Stack, Title } from "@mantine/core";
import { TimerIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { getHomeStatistics } from "../../../api/statistics/api/statisticsApi";
import { HomeStatisticsDto } from "../../../api/statistics/dto/homeStatisticsDto";
import {
	CardElementIcon,
	ExtractElementIcon,
	LearningAssetElementIcon,
} from "../../../config/icons";
import useApi from "../../../hooks/useApi";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectElementTree } from "../../../stores/elements/elementsSelectors";
import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "../../../stores/sync/managers/syncEventManager";
import { formatStudyDuration } from "../../../utils/formatStudyDuration";
import ActivityHeatmap from "./ActivityHeatmap";
import StatCard from "./StatCard";

export default function HomeStatistics() {
	const { callApi, errorMessage, clearErrorMessage } = useApi();
	const [statistics, setStatistics] = useState<HomeStatisticsDto | null>(
		null,
	);
	// Trashing and restoring reload the tree, and change the due forecast.
	const elementTree = useAppSelector(selectElementTree);

	const load = useCallback(
		() =>
			callApi(getHomeStatistics).then(result => {
				if (!result) return;
				setStatistics(result);
				clearErrorMessage();
			}),
		[callApi, clearErrorMessage],
	);

	useEffect(() => {
		void load();
	}, [load, elementTree]);

	// "Today" and the heatmap's year roll over at midnight.
	useEffect(() => {
		const msUntilMidnight = dayjs().add(1, "day").startOf("day").diff();
		const timeout = setTimeout(() => void load(), msUntilMidnight);
		return () => clearTimeout(timeout);
	}, [load, statistics]);

	useEffect(() => {
		defaultGlobalSyncEventManager.addListener(
			ListenerType.PostSyncComplete,
			load,
		);
		return () =>
			defaultGlobalSyncEventManager.removeListener(
				ListenerType.PostSyncComplete,
				load,
			);
	}, [load]);

	if (errorMessage && !statistics) {
		return (
			<Alert color="red" title="Couldn't load your statistics">
				{errorMessage}
			</Alert>
		);
	}

	const dailyActivity = statistics?.dailyActivity ?? [];
	const dailyForecast = statistics?.dailyForecast ?? [];

	return (
		<Stack gap="md">
			{errorMessage && (
				<Alert color="red" title="Couldn't refresh your statistics">
					{errorMessage}
				</Alert>
			)}
			<SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
				<StatCard
					icon={TimerIcon}
					label="Studied today"
					value={
						statistics &&
						formatStudyDuration(statistics.todayStudyDurationMs)
					}
				/>
				<StatCard
					icon={LearningAssetElementIcon}
					label="Learning assets reviewed"
					value={statistics?.learningAssetCount.toLocaleString()}
				/>
				<StatCard
					icon={ExtractElementIcon}
					label="Extracts reviewed"
					value={statistics?.extractCount.toLocaleString()}
				/>
				<StatCard
					icon={CardElementIcon}
					label="Cards reviewed"
					value={statistics?.cardCount.toLocaleString()}
				/>
			</SimpleGrid>

			<Paper withBorder radius="md" p="md">
				<Stack gap="sm">
					<Title order={3} size="h5">
						Study activity
					</Title>
					<ActivityHeatmap
						dailyActivity={dailyActivity}
						dailyForecast={dailyForecast}
					/>
				</Stack>
			</Paper>
		</Stack>
	);
}
