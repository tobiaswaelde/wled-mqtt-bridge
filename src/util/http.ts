/**
 * Util class for making HTTP requests.
 */
export class Http {
	private baseUrl: string;

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl;
	}

	public async get<T>(path: string): Promise<T> {
		const res = await fetch(`${this.baseUrl}${path}`);
		if (!res.ok) {
			throw new Error(`GET ${path} failed with ${res.status}`);
		}
		return res.json() as Promise<T>;
	}

	public async post<T>(path: string, body: unknown): Promise<T> {
		const res = await fetch(`${this.baseUrl}${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			throw new Error(`POST ${path} failed with ${res.status}`);
		}
		return res.json() as Promise<T>;
	}
}
