import fs from "fs";
import os from "node:os";
import path from "node:path";
import Jimp from "jimp";
import jsQR from "jsqr";

// types and interfaces
interface ScanMetrics {
	total: number;
	successful: number;
	failed: number;
}

interface ScanResult {
	file: string;
	qrData: string | null;
}

interface ProcessingResult {
	results: ScanResult[];
	metrics: ScanMetrics;
}

// constants
const PROJECT_ROOT = path.join(__dirname, "..");
const INPUT_DIR = path.join(PROJECT_ROOT, "input");
const RESULTS_FILE = path.join(PROJECT_ROOT, "qr_results.txt");
const MAX_CONCURRENT = Math.max(1, os.cpus().length - 1);
const CONSOLE_WIDTH = 80;

/**
 * Formats a scan result with right-aligned filename
 * @param index - Current file index
 * @param total - Total number of files
 * @param success - Whether QR code was found
 * @param filename - Name of the file
 * @returns Formatted string with aligned filename
 */
const formatScanResult = (index: number, total: number, success: boolean, filename: string): string => {
	const status = `(${index}/${total}) ${success ? "Success" : "No QR code found"}`;
	const padding = " ".repeat(Math.max(2, CONSOLE_WIDTH - status.length - filename.length));
	return `${status}${padding}${filename}`;
};

/**
 * Updates metrics based on scan results
 * @param metrics - Current metrics
 * @param result - New scan result
 * @returns Updated metrics
 */
const updateMetrics = (metrics: ScanMetrics, result: ScanResult): ScanMetrics => ({
	total: metrics.total + 1,
	successful: metrics.successful + (result.qrData ? 1 : 0),
	failed: metrics.failed + (result.qrData ? 0 : 1),
});

/**
 * Scans a single image for QR codes using jsQR
 * @param imagePath - Path to the image file
 * @returns Promise with QR code data or null if not found
 */
const scanQRCode = async (imagePath: string): Promise<string | null> => {
	try {
		// read and process image using jimp
		const image = await Jimp.read(imagePath);
		const { width, height } = image.bitmap;
		const imageData = new Uint8ClampedArray(width * height * 4);

		// convert jimp image data to format required by jsQR
		image.scan(0, 0, width, height, function (x, y, _idx) {
			const pixel = this.getPixelColor(x, y);
			const rgba = Jimp.intToRGBA(pixel);
			const index = (y * width + x) * 4;

			imageData[index] = rgba.r;
			imageData[index + 1] = rgba.g;
			imageData[index + 2] = rgba.b;
			imageData[index + 3] = rgba.a;
		});

		// attempt to detect QR code
		const code = jsQR(imageData, width, height);
		return code?.data ?? null;
	} catch (error) {
		console.error(`Error processing ${path.basename(imagePath)}:`, error);
		return null;
	}
};

/**
 * Processes a batch of images concurrently
 * @param imagePaths - Array of image paths to process
 * @param currentMetrics - Current processing metrics
 * @param totalFiles - Total number of files being processed
 * @returns Promise with results and updated metrics
 */
const processBatch = async (
	imagePaths: string[],
	currentMetrics: ScanMetrics,
	totalFiles: number,
): Promise<ProcessingResult> => {
	// process all images in the batch concurrently
	const results = await Promise.all(
		imagePaths.map(async (imagePath, idx): Promise<ScanResult> => {
			const file = path.basename(imagePath);
			const currentIndex = currentMetrics.total + idx + 1;
			const qrData = await scanQRCode(imagePath);

			// log the result with aligned filename
			console.log(formatScanResult(currentIndex, totalFiles, !!qrData, file));

			return { file, qrData };
		}),
	);

	// calculate metrics for this batch and combine with current metrics
	const metrics = results.reduce(updateMetrics, currentMetrics);

	return { results, metrics };
};

/**
 * Writes successful QR code results to file
 * @param results - Array of scan results
 */
const writeResultsToFile = (results: ScanResult[]): void => {
	const successfulScans = results
		.filter((r) => r.qrData !== null)
		.map((r) => r.qrData)
		.join("\n");
	fs.writeFileSync(RESULTS_FILE, successfulScans);
};

/**
 * Logs final processing metrics
 * @param metrics - Final processing metrics
 */
const logMetrics = (metrics: ScanMetrics): void => {
	console.log("\nProcessing Metrics:");
	console.log(`Total images processed: ${metrics.total}`);
	console.log(`Successful QR codes found: ${metrics.successful}`);
	console.log(`Failed to find QR codes: ${metrics.failed}`);
	console.log(`Success rate: ${((metrics.successful / metrics.total) * 100).toFixed(2)}%`);
};

/**
 * Main execution function
 */
const main = async (): Promise<void> => {
	try {
		const startTime = Date.now();

		// get and filter image files
		const files = fs
			.readdirSync(INPUT_DIR)
			.filter((file) => file.match(/\.(jpg|jpeg|png)$/i))
			.map((file) => path.join(INPUT_DIR, file));

		const totalFiles = files.length;
		console.log(`Processing ${totalFiles} images in batches of ${MAX_CONCURRENT} (based on CPU cores)...`);

		// initialize processing state
		let metrics: ScanMetrics = { total: 0, successful: 0, failed: 0 };
		let allResults: ScanResult[] = [];

		// process files in batches
		for (let i = 0; i < files.length; i += MAX_CONCURRENT) {
			const batch = files.slice(i, i + MAX_CONCURRENT);
			const batchNumber = Math.floor(i / MAX_CONCURRENT) + 1;
			const totalBatches = Math.ceil(files.length / MAX_CONCURRENT);

			console.log(`\nBatch ${batchNumber}/${totalBatches}`);

			// process batch and update metrics
			const { results, metrics: newMetrics } = await processBatch(batch, metrics, totalFiles);

			// calculate and log batch-specific metrics
			const batchSuccessful = newMetrics.successful - metrics.successful;
			const batchFailed = newMetrics.failed - metrics.failed;

			console.log("");
			console.log(`Batch ${batchNumber}/${totalBatches} (${batchSuccessful} succeeded, ${batchFailed} failed)`);
			console.log("");

			metrics = newMetrics;
			allResults = [...allResults, ...results];
		}

		// write results and log final metrics
		writeResultsToFile(allResults);
		logMetrics(metrics);

		const endTime = Date.now();
		const totalSeconds = ((endTime - startTime) / 1000).toFixed(1);
		console.log(`\nTotal time: ${totalSeconds} seconds`);
		console.log(`QR codes saved to: ${RESULTS_FILE}`);

		process.exit(0);
	} catch (error) {
		console.error("Error:", error);
		process.exit(1);
	}
};

// start the application
main();
