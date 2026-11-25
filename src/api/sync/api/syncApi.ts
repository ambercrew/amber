import { invoke } from "@tauri-apps/api/core";
import { SyncResponseDto } from "../dto/syncResponseDto";

export function sync(): Promise<SyncResponseDto> {
	return invoke("sync");
}
