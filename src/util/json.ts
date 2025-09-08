/**
 * Get all JSON paths in a nested object
 * @param {Record<string, any>} obj The object to inspect
 * @param {string} separator The path separator (default: '.')
 * @param {string} parentKey The parent key (used for recursion)
 * @returns {Map<string, any>} A map of JSON paths to their values
 */
export function getJsonPaths(
	obj: Record<string, any>,
	separator: string = '.',
	parentKey: string = ''
): Map<string, any> {
	const paths: Map<string, string> = new Map();

	for (const [key, value] of Object.entries(obj)) {
		const fullPath = parentKey ? `${parentKey}${separator}${key}` : key;

		// if the value is an array, stringify it
		if (Array.isArray(value)) {
			paths.set(fullPath, JSON.stringify(value));
		}
		// if the value is an object, recurse
		else if (typeof value === 'object') {
			const nestedPaths = getJsonPaths(value, separator, fullPath);
			for (const [nestedKey, nestedValue] of nestedPaths) {
				paths.set(nestedKey, nestedValue);
			}
		}
		// otherwise, just set the value
		else {
			paths.set(fullPath, String(value));
		}
	}

	return paths;
}
