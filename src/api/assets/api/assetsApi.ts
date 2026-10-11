import { invoke } from "@tauri-apps/api/core";
import { AssetResponseDto } from "../dto/assetResponseDto";
import { CreateAssetRequestDto } from "../dto/createAssetRequestDto";
import { CreateAssetsRequestDto } from "../dto/createAssetsRequestDto";

export function createAsset(
	dto: CreateAssetRequestDto,
): Promise<AssetResponseDto> {
	return invoke("create_asset", { dto });
}

/** Stores every image in one transaction; answers in request order, `null` for an undecodable image. */
export function createAssets(
	dto: CreateAssetsRequestDto,
): Promise<(AssetResponseDto | null)[]> {
	return invoke("create_assets", { dto });
}
