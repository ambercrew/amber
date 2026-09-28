import { invoke } from "@tauri-apps/api/core";
import { HomeStatisticsDto } from "../dto/homeStatisticsDto";

export function getHomeStatistics(): Promise<HomeStatisticsDto> {
	return invoke("get_home_statistics");
}
