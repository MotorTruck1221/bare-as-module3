// Implements the protocol for requesting bare data from a server
// See ../Server/Send.mjs

export * from './Client';

import { GenericClient, statusRedirect } from './Client';
import ClientV1 from './V1';
import ClientV2 from './V2';

const clientCtors: { [key: string]: { new (server: URL): GenericClient } } = {
	v1: ClientV1,
	v2: ClientV2,
};

export type BareMethod =
	| 'GET'
	| 'POST'
	| 'DELETE'
	| 'OPTIONS'
	| 'PUT'
	| 'PATCH'
	| 'UPDATE'
	| string;

export type BareCache =
	| 'default'
	| 'no-store'
	| 'reload'
	| 'no-cache'
	| 'force-cache'
	| 'only-if-cached'
	| string;

export interface XBare {
	status?: number;
	statusText?: string;
	headers?: Headers;
	rawHeaders?: BareHeaders;
}

export type BareHTTPProtocol = 'blob:' | 'http:' | 'https:' | string;
export type BareWSProtocol = 'ws:' | 'wss:' | string;

export type urlLike = URL | string;

export const maxRedirects = 20;

export type BareHeaders = { [key: string]: string | string[] };

/**
 * WebSocket with an additional property.
 */
export type BareWebSocket = WebSocket & { meta: Promise<XBare> };

/**
 * A Response with additional properties.
 */
export type BareResponse = Response & {
	rawResponse: Response;
	rawHeaders: BareHeaders;
};

/**
 * A BareResponse with additional properties.
 */
export type BareResponseFetch = BareResponse & { finalURL: string };
export type BareBodyInit =
	| Blob
	| BufferSource
	| FormData
	| URLSearchParams
	| ReadableStream
	| undefined;

export type BareFetchInit = {
	method?: BareMethod;
	headers?: Headers | BareHeaders;
	body?: BareBodyInit;
	cache?: BareCache;
	redirect?: 'follow' | 'manual' | 'error' | string;
	signal?: AbortSignal;
};

export type BareClientData = {
	maintainer?: {
		email?: string;
		website?: string;
	};
	project?: {
		name?: string;
		description?: string;
		email?: string;
		website?: string;
		repository?: string;
	};
	versions: string[];
	language:
		| 'JS'
		| 'TS'
		| 'Java'
		| 'PHP'
		| 'Rust'
		| 'C'
		| 'C++'
		| 'C#'
		| 'Ruby'
		| 'Go'
		| 'Crystal'
		| 'Bash'
		| string;
	memoryUsage?: number;
};

export default class BareClient {
	data: BareClientData | undefined;
	private client: GenericClient | undefined;
	private server: URL;
	private ready: boolean;
	/**
	 *
	 * @param server A full URL to the bare server.
	 * @param data The a copy of the Bare server data found in BareClient.data. If specified, this data will be loaded. Otherwise, a request will be made to the bare server (upon fetching or creating a WebSocket).
	 */
	constructor(server: string | URL, data?: BareClientData) {
		this.server = new URL(server);
		this.ready = false;

		if (typeof data === 'object') {
			this.loadData(data);
		}
	}
	private loadData(data: BareClientData) {
		let found = false;

		// newest-oldest
		for (const version in clientCtors) {
			const ctor = clientCtors[version];

			if (data.versions.includes(version)) {
				this.client = new ctor(this.server);
				found = true;
				break;
			}
		}

		if (!found) {
			throw new Error(`Unable to find compatible client version.`);
		}

		this.data = data;
		this.ready = true;
	}
	private async work() {
		if (this.ready === true) {
			return;
		}

		const outgoing = await fetch(this.server);

		if (!outgoing.ok) {
			throw new Error(
				`Unable to fetch Bare meta: ${outgoing.status} ${await outgoing.text()}`
			);
		}

		this.loadData(await outgoing.json());
	}
	async request(
		method: BareMethod,
		requestHeaders: BareHeaders,
		body: BareBodyInit,
		protocol: BareHTTPProtocol,
		host: string,
		port: string | number,
		path: string,
		cache: BareCache | undefined,
		signal: AbortSignal | undefined
	): Promise<BareResponse> {
		await this.work();
		return await this.client!.request(
			method,
			requestHeaders,
			body,
			protocol,
			host,
			port,
			path,
			cache,
			signal
		);
	}
	async connect(
		requestHeaders: BareHeaders,
		protocol: BareWSProtocol,
		host: string,
		port: string | number,
		path: string
	): Promise<BareWebSocket> {
		await this.work();
		return this.client!.connect(requestHeaders, protocol, host, port, path);
	}
	async fetch(
		url: urlLike,
		init: BareFetchInit = {}
	): Promise<BareResponseFetch> {
		url = new URL(url);

		let method: BareMethod;

		if (typeof init.method === 'string') {
			method = init.method;
		} else {
			method = 'GET';
		}

		let body: BareBodyInit;

		if (init.body !== undefined && init.body !== null) {
			body = init.body;
		}

		let headers: BareHeaders;

		if (typeof init.headers === 'object' && init.headers !== null) {
			if (init.headers instanceof Headers) {
				headers = Object.fromEntries(init.headers);
			} else {
				headers = init.headers;
			}
		} else {
			headers = {};
		}

		let cache: BareCache;

		if (typeof init.cache === 'string') {
			cache = init.cache;
		} else {
			cache = 'default';
		}

		let signal: AbortSignal | undefined;

		if (init.signal instanceof AbortSignal) {
			signal = init.signal;
		}

		for (let i = 0; ; i++) {
			let port;

			if (url.port === '') {
				if (url.protocol === 'https:') {
					port = '443';
				} else {
					port = '80';
				}
			} else {
				port = url.port;
			}

			headers.host = url.host;

			const response: BareResponse & Partial<BareResponseFetch> =
				await this.request(
					method,
					headers,
					body,
					url.protocol,
					url.hostname,
					port,
					url.pathname + url.search,
					cache,
					signal
				);

			response.finalURL = url.toString();

			if (statusRedirect.includes(response.status)) {
				switch (init.redirect) {
					default:
					case 'follow':
						if (maxRedirects > i && response.headers.has('location')) {
							url = new URL(response.headers.get('location')!, url);
							continue;
						} else {
							throw new TypeError('Failed to fetch');
						}
					case 'error':
						throw new TypeError('Failed to fetch');
					case 'manual':
						return <BareResponseFetch>response;
				}
			} else {
				return <BareResponseFetch>response;
			}
		}
	}
}
