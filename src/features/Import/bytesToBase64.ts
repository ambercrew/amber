const BASE64_CHUNK_SIZE = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
		binary += String.fromCharCode(
			...bytes.subarray(i, i + BASE64_CHUNK_SIZE),
		);
	}
	return btoa(binary);
}
