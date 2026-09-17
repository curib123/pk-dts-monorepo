import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, tap } from 'rxjs';
import { BACKEND_API_BASE_URL } from '@/app/config/api-config';
import { ApiResponseEnvelope } from '../documents/documents.types';
import { CreateHardcopyTransferPayload, HardcopyTransfer } from './hardcopy-transfers.types';

const TRANSFERS_API = `${BACKEND_API_BASE_URL}/hardcopy-transfers`;
type ApiResponse<T> = ApiResponseEnvelope<T> | T;

@Injectable({ providedIn: 'root' })
export class HardcopyTransfersService {
    private readonly http = inject(HttpClient);

    listMine() {
        return this.http.get<ApiResponse<HardcopyTransfer[]>>(`${TRANSFERS_API}/mine`).pipe(map(response => this.unwrap(response)));
    }

    listPending() {
        return this.http.get<ApiResponse<HardcopyTransfer[]>>(`${TRANSFERS_API}/pending`).pipe(map(response => this.unwrap(response)));
    }

    create(payload: CreateHardcopyTransferPayload) {
        return this.http.post<ApiResponse<HardcopyTransfer>>(TRANSFERS_API, payload).pipe(map(response => this.unwrap(response)));
    }

    action(id: string, action: 'submit' | 'approve' | 'return' | 'reject' | 'resubmit' | 'complete', remarks = '') {
        const body = { remarks };
        return this.http.post<ApiResponse<HardcopyTransfer>>(`${TRANSFERS_API}/${id}/${action}`, body).pipe(map(response => this.unwrap(response)), tap(() => undefined));
    }

    private unwrap<T>(response: ApiResponse<T>): T {
        return !!response && typeof response === 'object' && 'data' in response ? response.data : response as T;
    }
}
