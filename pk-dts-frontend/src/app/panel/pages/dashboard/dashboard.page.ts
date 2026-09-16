import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartData, ChartOptions } from 'chart.js';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '@/app/auth/auth.service';
import { LoadingShimmerComponent } from '@/app/shared/components/loading-shimmer/loading-shimmer.component';
import { SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { DashboardService } from './dashboard.service';
import { DashboardRecentDocumentItem, DashboardSummary } from './dashboard.types';

interface QuickAction { label: string; route: string; icon: string; permissions: string[]; }

@Component({
    selector: 'app-dashboard-page',
    standalone: true,
    imports: [CommonModule, RouterLink, ButtonModule, ChartModule, TooltipModule, LoadingShimmerComponent],
    template: `
        <app-loading-shimmer *ngIf="loading()" label="Loading dashboard" [metrics]="3" [columns]="3" />
        <main class="dashboard" *ngIf="!loading()">
            <header class="welcome">
                <div class="welcome-copy">
                    <span class="welcome-icon"><i class="pi pi-sparkles"></i></span>
                    <div>
                        <span class="welcome-kicker">{{ greeting() }}</span>
                        <h1>Welcome back, {{ firstName() }}.</h1>
                        <p>{{ greetingMessage() }}</p>
                        <small><i class="pi pi-calendar"></i>{{ todayLabel() }}</small>
                    </div>
                </div>
                <div class="welcome-actions">
                    <a routerLink="/" class="search-action"><i class="pi pi-search"></i> Search documents</a>
                    <p-button icon="pi pi-refresh" [rounded]="true" [text]="true" pTooltip="Refresh dashboard" (onClick)="loadSummary()" />
                </div>
            </header>

            <div *ngIf="errorMessage()" class="error"><i class="pi pi-exclamation-triangle"></i>{{ errorMessage() }}</div>

            <section class="summary" aria-label="Document summary">
                <article class="summary-primary">
                    <span class="summary-icon"><i class="pi pi-folder-open"></i></span>
                    <div><small>Documents available to you</small><strong>{{ counters()?.documents ?? 0 | number }}</strong></div>
                </article>
                <article><small>Approved</small><strong>{{ counters()?.approved_documents ?? 0 | number }}</strong><span class="positive"><i class="pi pi-check-circle"></i>{{ approvalRate() }}% of records</span></article>
                <article><small>In workflow</small><strong>{{ otherDocumentCount() | number }}</strong><span><i class="pi pi-clock"></i>Needs attention</span></article>
            </section>

            <nav *ngIf="quickActions().length" class="shortcuts" aria-label="Quick actions">
                <a *ngFor="let action of quickActions(); trackBy: trackAction" [routerLink]="action.route"><i [class]="action.icon"></i><span>{{ action.label }}</span></a>
            </nav>

            <section class="content-grid">
                <article class="panel overview">
                    <header><div><span class="kicker">Overview</span><h2>Document library</h2></div><small>Updated {{ shortDate(summary()?.generated_at) }}</small></header>
                    <div class="overview-body">
                        <div class="chart-wrap">
                            <p-chart type="doughnut" [data]="statusChartData()" [options]="doughnutOptions()" />
                            <div class="chart-center"><strong>{{ approvalRate() }}%</strong><span>approved</span></div>
                        </div>
                        <div class="breakdown">
                            <div><span><i class="hardcopy"></i>Hardcopy</span><strong>{{ counters()?.hardcopies ?? 0 | number }}</strong><div><i [style.width.%]="hardcopyShare()"></i></div></div>
                            <div><span><i class="softcopy"></i>Softcopy</span><strong>{{ counters()?.softcopies ?? 0 | number }}</strong><div><i [style.width.%]="digitalShare()"></i></div></div>
                            <div><span><i class="disposed"></i>Disposed</span><strong>{{ counters()?.disposed_documents ?? 0 | number }}</strong></div>
                        </div>
                    </div>
                </article>

                <article *ngIf="canViewDocuments()" class="panel recent">
                    <header><div><span class="kicker">Recent</span><h2>Latest documents</h2></div><a routerLink="/panel/documents">View all <i class="pi pi-arrow-right"></i></a></header>
                    <div class="document-list">
                        <a *ngFor="let document of recentDocuments(); trackBy: trackDocument" routerLink="/panel/documents" [queryParams]="{ document: document.document_id }" class="document-row">
                            <span class="doc-icon" [class.softcopy]="document.document_type === 'SOFTCOPY'"><i class="pi" [ngClass]="document.document_type === 'SOFTCOPY' ? 'pi-file' : 'pi-box'"></i></span>
                            <span class="doc-copy"><strong>{{ document.document_title }}</strong><small *ngIf="document.document_type === 'SOFTCOPY'">{{ document.document_number || 'No document number' }}</small><small *ngIf="document.document_type === 'HARDCOPY'">Hardcopy record</small></span>
                            <span class="doc-meta"><em>{{ statusLabel(document.status) }}</em><time>{{ shortDate(document.created_at) }}</time></span>
                        </a>
                        <div *ngIf="!recentDocuments().length" class="empty"><i class="pi pi-inbox"></i><span>No recent documents</span></div>
                    </div>
                </article>
            </section>
        </main>
    `,
    styles: [`
        :host{display:block}.dashboard{display:grid;gap:1rem;color:#172033}.welcome{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:space-between;gap:1rem;border-radius:1.2rem;background:linear-gradient(120deg,#fff 0%,color-mix(in srgb,var(--dts-accent-soft,var(--brand-soft-strong)) 58%,#fff) 100%);padding:1.25rem 1.35rem;box-shadow:0 10px 28px rgba(15,23,42,.05)}.welcome::after{content:'';position:absolute;right:11rem;width:9rem;height:9rem;border-radius:50%;background:color-mix(in srgb,var(--dts-accent,var(--brand-primary)) 8%,transparent)}.welcome-copy{position:relative;z-index:1;display:flex;align-items:center;gap:1rem}.welcome-icon{display:grid;place-items:center;width:3.5rem;height:3.5rem;flex:0 0 auto;border-radius:1rem;background:linear-gradient(135deg,var(--dts-accent,var(--brand-primary)),var(--dts-accent-deep,var(--brand-primary-deep)));color:#fff;font-size:1.25rem;box-shadow:0 10px 24px color-mix(in srgb,var(--dts-accent,var(--brand-primary)) 24%,transparent)}.welcome-kicker{color:var(--dts-accent-deep,var(--brand-primary-deep));font-size:.68rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.welcome h1{margin:.12rem 0 0;color:#0f172a;font-size:1.65rem;letter-spacing:-.035em}.welcome p{margin:.3rem 0;color:#64748b;font-size:.76rem}.welcome small{display:flex;align-items:center;gap:.35rem;color:#94a3b8;font-size:.65rem}.welcome-actions{position:relative;z-index:1;display:flex;align-items:center;gap:.35rem}.search-action{display:flex;align-items:center;gap:.45rem;border-radius:.75rem;background:var(--dts-accent,var(--brand-primary));padding:.7rem .9rem;color:#fff;font-size:.75rem;font-weight:800;text-decoration:none;box-shadow:0 7px 16px color-mix(in srgb,var(--dts-accent) 20%,transparent)}.error{display:flex;align-items:center;gap:.55rem;border-radius:.8rem;background:var(--brand-soft);padding:.75rem 1rem;color:var(--brand-primary);font-size:.8rem}
        .summary{display:grid;grid-template-columns:1.35fr 1fr 1fr;gap:.8rem}.summary article{display:grid;align-content:center;min-height:6.6rem;border:1px solid #e5e7eb;border-radius:1rem;background:#fff;padding:1rem 1.1rem;box-shadow:0 7px 22px rgba(15,23,42,.045)}.summary .summary-primary{grid-template-columns:auto 1fr;align-items:center;gap:.85rem;background:var(--dts-accent-deep,var(--brand-primary-deep));color:#fff}.summary-icon{display:grid;place-items:center;width:3rem;height:3rem;border-radius:.9rem;background:rgba(255,255,255,.14);font-size:1.2rem}.summary small{color:#64748b;font-size:.7rem;font-weight:750}.summary-primary small{color:rgba(255,255,255,.72)}.summary strong{display:block;margin:.22rem 0;color:#0f172a;font-size:1.75rem;letter-spacing:-.04em}.summary-primary strong{color:#fff;font-size:2rem}.summary article>span:last-child{display:flex;align-items:center;gap:.3rem;color:#94a3b8;font-size:.65rem}.summary .positive{color:#15803d!important}
        .shortcuts{display:flex;flex-wrap:wrap;gap:.5rem}.shortcuts a{display:flex;align-items:center;gap:.45rem;border:1px solid #e5e7eb;border-radius:999px;background:#fff;padding:.5rem .75rem;color:#475569;font-size:.7rem;font-weight:800;text-decoration:none;transition:.16s ease}.shortcuts a i{color:var(--dts-accent-deep,var(--brand-primary-deep))}.shortcuts a:hover{border-color:var(--dts-accent);background:var(--dts-accent-soft);color:var(--dts-accent-deep);transform:translateY(-1px)}
        .content-grid{display:grid;grid-template-columns:minmax(19rem,.85fr) minmax(0,1.35fr);gap:1rem}.panel{border:1px solid #e5e7eb;border-radius:1.05rem;background:#fff;padding:1.05rem;box-shadow:0 8px 24px rgba(15,23,42,.04)}.panel>header{display:flex;align-items:center;justify-content:space-between;gap:1rem}.kicker{color:var(--dts-accent-deep,var(--brand-primary-deep));font-size:.62rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.panel h2{margin:.15rem 0 0;color:#111827;font-size:1rem}.panel header>small{color:#94a3b8;font-size:.65rem}.panel header>a{color:var(--dts-accent-deep,var(--brand-primary-deep));font-size:.7rem;font-weight:850;text-decoration:none}
        .overview-body{display:grid;grid-template-columns:11rem 1fr;align-items:center;gap:1rem;margin-top:1rem}.chart-wrap{position:relative;height:10.5rem}.chart-wrap ::ng-deep .p-chart{display:block;height:100%}.chart-wrap ::ng-deep canvas{max-height:100%}.chart-center{position:absolute;inset:0;display:grid;place-content:center;text-align:center;pointer-events:none}.chart-center strong{color:#0f172a;font-size:1.35rem}.chart-center span{color:#94a3b8;font-size:.58rem}.breakdown{display:grid;gap:.8rem}.breakdown>div{display:grid;grid-template-columns:1fr auto;align-items:center;gap:.25rem .5rem}.breakdown span{display:flex;align-items:center;gap:.4rem;color:#64748b;font-size:.7rem}.breakdown span i{width:.5rem;height:.5rem;border-radius:50%;background:#f59e0b}.breakdown span .softcopy{background:#2563eb}.breakdown span .disposed{background:var(--brand-primary)}.breakdown strong{color:#172033;font-size:.8rem}.breakdown>div>div{grid-column:1/-1;height:.28rem;overflow:hidden;border-radius:99px;background:#f1f5f9}.breakdown>div>div i{display:block;height:100%;border-radius:inherit;background:#f59e0b}.breakdown>div:nth-child(2)>div i{background:#2563eb}
        .document-list{display:grid;margin-top:.65rem}.document-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:.7rem;border-top:1px solid #f1f5f9;border-radius:.65rem;padding:.65rem .4rem;color:inherit;text-decoration:none}.document-row:hover{background:#f8fafc}.doc-icon{display:grid;place-items:center;width:2.15rem;height:2.15rem;border-radius:.65rem;background:#fef3c7;color:#92400e}.doc-icon.softcopy{background:#dbeafe;color:#1d4ed8}.doc-copy{min-width:0}.doc-copy strong,.doc-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.doc-copy strong{color:#172033;font-size:.75rem}.doc-copy small{margin-top:.15rem;color:#94a3b8;font-size:.65rem}.doc-meta{display:grid;justify-items:end;gap:.18rem}.doc-meta em{border-radius:999px;background:#f1f5f9;padding:.22rem .4rem;color:#475569;font-size:.58rem;font-style:normal;font-weight:800}.doc-meta time{color:#94a3b8;font-size:.6rem}.empty{display:grid;place-items:center;gap:.4rem;padding:2.5rem;color:#94a3b8;font-size:.72rem}.empty i{font-size:1.4rem}
        :host-context(.app-dark) .dashboard{color:#e5e7eb}:host-context(.app-dark) .welcome h1,:host-context(.app-dark) .summary strong,:host-context(.app-dark) .panel h2,:host-context(.app-dark) .chart-center strong,:host-context(.app-dark) .breakdown strong,:host-context(.app-dark) .doc-copy strong{color:#f5f5f5}:host-context(.app-dark) .summary article,:host-context(.app-dark) .panel,:host-context(.app-dark) .shortcuts a{border-color:#353535;background:#202020;box-shadow:none}:host-context(.app-dark) .summary .summary-primary{background:color-mix(in srgb,var(--dts-accent-deep) 48%,#101010)}:host-context(.app-dark) .summary small,:host-context(.app-dark) .breakdown span,:host-context(.app-dark) .welcome>div:first-child>span{color:#a3a3a3}:host-context(.app-dark) .shortcuts a{color:#d4d4d4}:host-context(.app-dark) .shortcuts a:hover,:host-context(.app-dark) .document-row:hover{background:#292929}:host-context(.app-dark) .document-row{border-color:#303030}:host-context(.app-dark) .doc-meta em,:host-context(.app-dark) .breakdown>div>div{background:#2f2f2f;color:#a3a3a3}:host-context(.app-dark) .error{background:#331818;color:var(--brand-border)}
        :host-context(.app-dark) .welcome{background:linear-gradient(120deg,#202020,color-mix(in srgb,var(--dts-accent-deep) 16%,#202020))}
        @media(max-width:1000px){.content-grid{grid-template-columns:1fr}.summary{grid-template-columns:1.2fr 1fr 1fr}}@media(max-width:680px){.welcome{align-items:flex-start}.welcome-icon{width:3rem;height:3rem}.welcome p{max-width:25rem}.search-action{padding:.65rem}.summary{grid-template-columns:1fr 1fr}.summary-primary{grid-column:1/-1}.overview-body{grid-template-columns:1fr}.chart-wrap{height:11rem}.breakdown{grid-template-columns:repeat(3,1fr)}.breakdown>div>div{display:none}}@media(max-width:430px){.welcome{padding:1rem}.welcome-icon{display:none}.search-action{font-size:0}.search-action i{font-size:.85rem}.summary{grid-template-columns:1fr}.summary-primary{grid-column:auto}.breakdown{grid-template-columns:1fr}.document-row{grid-template-columns:auto minmax(0,1fr)}.doc-meta{grid-column:2;justify-items:start}}
    `]
})
export class DashboardPage implements OnInit {
    private auth=inject(AuthService); private dashboardService=inject(DashboardService); private systemSettings=inject(SystemSettingsService);
    summary=signal<DashboardSummary|null>(null); loading=signal(true); errorMessage=signal('');
    counters=computed(()=>this.summary()?.counters??null); recentDocuments=computed(()=>this.summary()?.recent_documents?.slice(0,5)??[]);
    canViewDocuments=computed(()=>this.auth.hasAnyPermission('documents.view','document-requests.view'));
    quickActions=computed(()=>this.actions.filter(action=>this.auth.hasAnyPermission(...action.permissions)));
    statusChartData=computed<ChartData<'doughnut'>>(()=>({labels:['Approved','In workflow','Disposed'],datasets:[{data:[this.counters()?.approved_documents??0,this.otherDocumentCount(),this.counters()?.disposed_documents??0],backgroundColor:['#16a34a','#f59e0b','var(--brand-primary)'],borderWidth:0,hoverOffset:3}]}));
    doughnutOptions=computed<ChartOptions<'doughnut'>>(()=>({responsive:true,maintainAspectRatio:false,cutout:'72%',plugins:{legend:{display:false},tooltip:{displayColors:false,backgroundColor:this.systemSettings.settings().colorMode==='dark'?'#262626':'#111827'}}}));
    private actions:QuickAction[]=[
        {label:'Documents',route:'/panel/documents',icon:'pi pi-file',permissions:['documents.view']},
        {label:'My requests',route:'/panel/document-requests',icon:'pi pi-send',permissions:['document-requests.view-own']},
        {label:'Storage',route:'/panel/storage',icon:'pi pi-database',permissions:['storage-classification.view','location-management.view']},
        {label:'Users',route:'/panel/users',icon:'pi pi-users',permissions:['user-accounts.view','user-accounts.manage']}
    ];
    ngOnInit(){this.loadSummary();}
    loadSummary(){this.loading.set(true);this.errorMessage.set('');this.dashboardService.getSummary().subscribe({next:summary=>{this.summary.set(summary);this.loading.set(false);},error:(error:unknown)=>{this.errorMessage.set(this.extractErrorMessage(error));this.loading.set(false);}});}
    approvalRate(){const c=this.counters();return c?.documents?Math.round((c.approved_documents/c.documents)*100):0;}
    digitalShare(){const c=this.counters();return c?.documents?Math.round((c.softcopies/c.documents)*100):0;}
    hardcopyShare(){const c=this.counters();return c?.documents?Math.round((c.hardcopies/c.documents)*100):0;}
    otherDocumentCount(){const c=this.counters();return Math.max(0,(c?.documents??0)-(c?.approved_documents??0)-(c?.disposed_documents??0));}
    firstName(){return this.auth.user()?.firstname?.trim()||'Welcome';}
    greeting(){const hour=new Date().getHours();return hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';}
    greetingMessage(){const pending=this.otherDocumentCount();return pending?`You have ${pending} document ${pending===1?'record':'records'} currently moving through the workflow.`:'Your document workspace is up to date and ready for you.';}
    todayLabel(){return new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});}
    shortDate(value?:string|null){return value?new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'now';}
    statusLabel(status:DashboardRecentDocumentItem['status']){return ({Draft:'Draft',PendingApproval:'Pending Approval',ForNotedBy:'For Noted By',ForPlantManagerApproval:'For Plant Manager Approval',ForDocumentControllerAdmin:'For Document Controller/Admin Approval',ForApproval:'For Approval',Approved:'Approved — Pending Release',Completed:'Completed / Released',ForRevision:'For Revision',ReturnedForCorrection:'For Revision',Rejected:'Rejected',Cancelled:'Cancelled',Disposed:'Disposed'} as Record<string,string>)[status]||String(status).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ');}
    trackAction=(_index:number,action:QuickAction)=>action.route; trackDocument=(_index:number,document:DashboardRecentDocumentItem)=>document.document_id;
    private extractErrorMessage(error:unknown){if(error instanceof HttpErrorResponse){const body=error.error as {message?:unknown;error?:unknown}|string|null;if(typeof body==='string')return body;return String(body?.message||body?.error||error.message||'Request failed.');}return error instanceof Error?error.message:'Unexpected error.';}
}
