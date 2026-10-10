import { invoke } from "@tauri-apps/api/core";
import { AssetResponseDto } from "../dto/assetResponseDto";
import { CreateAssetRequestDto } from "../dto/createAssetRequestDto";

export function createAsset(
	dto: CreateAssetRequestDto,
): Promise<AssetResponseDto> {
	return invoke("create_asset", { dto });
}
