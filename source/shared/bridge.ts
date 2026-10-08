export interface ApiRequest {
  path: string;
  method: "GET" | "POST";
  token?: string;
  body?: unknown;
  binary?: boolean;
  upload?: { bytes: number[]; name: string; type: string };
}
export interface ApiResponse {
  status: number;
  body: any;
  mime?: string;
}
export interface DesktopBridge {
  request: (input: ApiRequest) => Promise<ApiResponse>;
  saveReport: (input: {
    path: string;
    token: string;
  }) => Promise<{ saved: boolean }>;
}
