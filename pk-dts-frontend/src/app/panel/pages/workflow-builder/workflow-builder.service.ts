import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, finalize, map, shareReplay } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';
import { BACKEND_API_BASE_URL } from '@/app/config/api-config';
import { PublishedWorkflowOption, PublishedWorkflowVersion, WorkflowDefinition, WorkflowGraph, WorkflowVersion } from './workflow-builder.types';

type Envelope<T> = T | { data: T };
const API = `${BACKEND_API_BASE_URL}/workflow-definitions`;

@Injectable({ providedIn: 'root' })
export class WorkflowBuilderService {
    private http = inject(HttpClient);
    private auth = inject(AuthService);
    private pendingDefaults = new Map<string, Observable<PublishedWorkflowOption[]>>();

    list(includeInactive = true) {
        return this.http.get<Envelope<WorkflowDefinition[]>>(API, { params: { include_inactive: includeInactive } }).pipe(map(this.unwrap));
    }

    publishedDefault(documentType: 'SOFTCOPY' | 'HARDCOPY', action: string) {
        const key = `${this.auth.token()}:${documentType}:${action}`;
        const pending = this.pendingDefaults.get(key);
        if (pending) return pending;
        const request = this.http.get<Envelope<PublishedWorkflowOption[]>>(`${API}/published-default`, {
            params: { document_type: documentType, action_requested: action }
        }).pipe(map(this.unwrap), finalize(() => this.pendingDefaults.delete(key)), shareReplay({ bufferSize: 1, refCount: true }));
        this.pendingDefaults.set(key, request);
        return request;
    }

    published(documentType?: 'SOFTCOPY' | 'HARDCOPY') {
        return this.http.get<Envelope<PublishedWorkflowVersion[]>>(`${API}/published`, {
            params: documentType ? { document_type: documentType } : {}
        }).pipe(map(this.unwrap));
    }

    create(payload: { workflow_key: string; name: string; description?: string; document_type?: 'SOFTCOPY' | 'HARDCOPY'; graph: WorkflowGraph }) {
        return this.http.post<Envelope<WorkflowDefinition>>(API, payload).pipe(map(this.unwrap));
    }

    createVersion(definitionId: string, graph: WorkflowGraph) {
        return this.http.post<Envelope<WorkflowVersion>>(`${API}/${definitionId}/versions`, { graph }).pipe(map(this.unwrap));
    }

    save(definitionId: string, versionId: string, graph: WorkflowGraph) {
        return this.http.put<Envelope<WorkflowVersion>>(`${API}/${definitionId}/versions/${versionId}`, { graph }).pipe(map(this.unwrap));
    }

    publish(definitionId: string, versionId: string) {
        return this.http.post<Envelope<WorkflowVersion>>(`${API}/${definitionId}/versions/${versionId}/publish`, {}).pipe(map(this.unwrap));
    }

    setActive(definitionId: string, isActive: boolean) {
        return this.http.patch<Envelope<WorkflowDefinition>>(`${API}/${definitionId}/active`, { is_active: isActive }).pipe(map(this.unwrap));
    }

    private unwrap<T>(response: Envelope<T>): T {
        return response && typeof response === 'object' && 'data' in response ? response.data : response;
    }
}
