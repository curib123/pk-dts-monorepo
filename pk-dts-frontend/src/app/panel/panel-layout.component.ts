import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Subject, catchError, filter, of, switchMap, takeUntil, timer } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';
import { ConfirmationDialogComponent } from '@/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { PANEL_NAVIGATION, PanelNavCategory, PanelNavItem, shouldShowPanelItem } from './panel-access.config';
import { DashboardService } from './pages/dashboard/dashboard.service';
import { NavigationNotificationCounts } from './pages/dashboard/dashboard.types';
import { NotificationsService, UserNotification } from './notifications.service';

const PANEL_BACKGROUND_POLL_DELAY_MS = 250;

@Component({
    selector: 'app-panel-layout',
    standalone: true,
    imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ButtonModule, ConfirmationDialogComponent],
    styleUrls: ['./panel-layout.component.scss'],
    template: `
        <div class="panel-shell">
            <div *ngIf="sidebarOpen()" class="panel-backdrop" (click)="closeSidebar()"></div>

            <aside class="panel-sidebar" [class.mobile-open]="sidebarOpen()">
                <div class="panel-brand">
                    <div class="brand-mark">
                        <img class="dts-brand-logo" [src]="settings().logoUrl" [alt]="settings().systemTitle + ' logo'" />
                    </div>
                    <div class="brand-copy">
                        <div class="brand-eyebrow">{{ settings().brandEyebrow }}</div>
                        <div class="brand-title">{{ settings().systemShortTitle }}</div>
                    </div>
                    <button type="button" class="sidebar-close" aria-label="Close navigation" (click)="closeSidebar()"><i class="pi pi-times"></i></button>
                </div>

                <div class="panel-navigation">
                    <div class="nav-section-label">Workspace</div>
                    <nav class="panel-nav" aria-label="Panel navigation">
                        <a *ngFor="let item of visiblePrimaryNavItems()" [routerLink]="item.route" routerLinkActive="active" class="nav-item">
                            <span class="nav-icon"><i [class]="item.icon"></i></span>
                            <span class="nav-label">{{ item.label }}</span>
                            <span *ngIf="notificationCount(item)" class="nav-count" [attr.aria-label]="notificationCount(item) + ' new items'">{{ displayNotificationCount(item) }}</span>
                            <i class="pi pi-chevron-right nav-arrow"></i>
                        </a>

                        <div *ngFor="let category of visibleNavCategories(); trackBy: trackCategory" class="nav-group" [class.open]="isCategoryOpen(category.id)" [class.active]="isCategoryActive(category)">
                            <button
                                type="button"
                                class="nav-item nav-category"
                                [attr.aria-expanded]="isCategoryOpen(category.id)"
                                [attr.aria-controls]="'nav-category-' + category.id"
                                (click)="toggleCategory(category.id)"
                            >
                                <span class="nav-icon"><i [class]="category.icon"></i></span>
                                <span class="nav-label">{{ category.label }}</span>
                                <i class="pi pi-chevron-down category-arrow"></i>
                            </button>
                            <div *ngIf="isCategoryOpen(category.id)" class="nav-children" [id]="'nav-category-' + category.id">
                                <a *ngFor="let item of category.items" [routerLink]="item.route" routerLinkActive="active" class="nav-item nav-child">
                                    <span class="nav-icon"><i [class]="item.icon"></i></span>
                                    <span class="nav-label">{{ item.label }}</span>
                                    <span *ngIf="notificationCount(item)" class="nav-count" [attr.aria-label]="notificationCount(item) + ' new items'">{{ displayNotificationCount(item) }}</span>
                                    <i class="pi pi-chevron-right nav-arrow"></i>
                                </a>
                            </div>
                        </div>
                    </nav>
                </div>

                <div class="panel-sidebar-card">
                    <div class="sidebar-profile">
                        <div class="sidebar-avatar"><i class="pi pi-user"></i></div>
                        <div class="sidebar-profile-copy">
                            <div class="sidebar-session-label">Signed in as</div>
                            <div class="sidebar-name">{{ userName() }}</div>
                            <div class="sidebar-role">{{ userRole() }}</div>
                        </div>
                    </div>
                    <button pButton type="button" class="sidebar-logout" severity="danger" label="Sign out" icon="pi pi-sign-out" (click)="openLogoutConfirm()"></button>
                </div>
            </aside>

            <div class="panel-main">
                <header class="panel-topbar">
                    <div class="topbar-left">
                        <button pButton type="button" class="topbar-menu" severity="secondary" text icon="pi pi-bars" (click)="toggleSidebar()"></button>
                        <div class="topbar-page-icon"><i class="pi pi-file"></i></div>
                        <div class="topbar-page-copy">
                            <span class="topbar-eyebrow">{{ pageEyebrow() }}</span>
                            <div class="topbar-title">{{ pageTitle() }}</div>
                            <div class="topbar-subtitle">{{ pageSubtitle() }}</div>
                        </div>
                    </div>

                    <div class="topbar-right">
                        <div class="notification-center">
                            <button type="button" class="notification-trigger" [class.open]="notificationsOpen()" [class.has-unread]="unreadCount() > 0" [attr.aria-expanded]="notificationsOpen()" aria-label="Open notifications" (click)="toggleNotifications($event)"><i class="pi pi-bell"></i><span *ngIf="unreadCount()" class="notification-badge">{{ unreadCount() > 99 ? '99+' : unreadCount() }}</span></button>
                            <section *ngIf="notificationsOpen()" class="notification-panel">
                                <header><div><strong>Notifications</strong><small>{{ unreadCount() }} unread</small></div><button *ngIf="unreadCount()" type="button" (click)="markAllRead()">Mark all read</button></header>
                                <div class="notification-list">
                                    <button *ngFor="let item of notifications(); trackBy: trackNotification" type="button" class="notification-item" [class.unread]="!item.read" (click)="openNotification(item)">
                                        <span class="notification-icon"><i [class]="item.icon"></i></span><span class="notification-copy"><strong>{{ item.title }}</strong><span>{{ item.message }}</span><small>{{ notificationTime(item.created_at) }}</small></span><span *ngIf="!item.read" class="unread-dot"></span>
                                    </button>
                                    <div *ngIf="!notifications().length" class="notification-empty"><i class="pi pi-bell-slash"></i><strong>You’re all caught up</strong><span>New assignments and document updates will appear here.</span></div>
                                </div>
                            </section>
                        </div>
                        <div class="topbar-account">
                            <div class="topbar-avatar">
                                <i class="pi pi-user"></i>
                            </div>
                            <div class="topbar-account-copy">
                                <div class="topbar-account-name">{{ userName() }}</div>
                                <div class="topbar-account-role">{{ userRole() }}</div>
                            </div>
                        </div>
                    </div>
                </header>

                <main class="panel-content">
                    <router-outlet></router-outlet>
                </main>
            </div>

            <app-confirmation-dialog
                [(visible)]="logoutConfirmVisible"
                title="Log out?"
                subtitle="End your current session"
                message="Are you sure you want to log out of the control panel?"
                confirmLabel="Log out"
                cancelLabel="Stay signed in"
                tone="primary"
                [dismissableMask]="true"
                (confirm)="confirmLogout()"
            />

        </div>
    `
})
export class PanelLayoutComponent implements OnInit, OnDestroy {
    private auth = inject(AuthService);
    private systemSettings = inject(SystemSettingsService);
    private dashboardService = inject(DashboardService);
    private notificationsService = inject(NotificationsService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private destroy$ = new Subject<void>();
    settings = this.systemSettings.settings;

    primaryNavItems: PanelNavItem[] = [PANEL_NAVIGATION.dashboard];
    navCategories: PanelNavCategory[] = PANEL_NAVIGATION.categories;

    pageEyebrow = signal('Document workspace');
    pageTitle = signal('Dashboard');
    pageSubtitle = signal('Your document-tracking overview will live here.');
    logoutConfirmVisible = false;

    userName = computed(() => {
        const user = this.auth.user();
        if (!user) {
            return 'Guest';
        }

        return `${user.firstname} ${user.lastname}`.trim();
    });

    userRole = computed(() => this.auth.user()?.role?.role_name ?? 'User');
    visiblePrimaryNavItems = computed(() => this.primaryNavItems.filter((item) => shouldShowPanelItem(item, this.accessContext())));
    visibleNavCategories = computed(() =>
        this.navCategories
            .map((category) => ({ ...category, items: category.items.filter((item) => shouldShowPanelItem(item, this.accessContext())) }))
            .filter((category) => category.items.length > 0)
    );
    openCategories = signal<Set<string>>(new Set());
    sidebarOpen = signal(false);
    notificationCounts = signal<NavigationNotificationCounts>({ approval_review: 0, document_requests: 0, disposal_requests: 0, access_requests: 0, hardcopy_transfers: 0, user_accounts: 0 });
    notifications = signal<UserNotification[]>([]);
    unreadCount = signal(0);
    notificationsOpen = signal(false);

    ngOnInit() {
        this.auth.refreshProfile()?.subscribe({
            next: () => this.openActiveCategory(),
            error: () => {
                this.auth.logout();
                this.router.navigate(['/auth/login']);
            }
        });
        this.syncPageMeta();
        this.openActiveCategory();
        timer(PANEL_BACKGROUND_POLL_DELAY_MS, 30_000)
            .pipe(
                switchMap(() => this.dashboardService.getNavigationCounts().pipe(catchError(() => of(null)))),
                takeUntil(this.destroy$)
            )
            .subscribe((counts) => { if (counts) this.notificationCounts.set(counts); });
        timer(PANEL_BACKGROUND_POLL_DELAY_MS, 30_000).pipe(switchMap(() => this.notificationsService.list().pipe(catchError(() => of(null)))), takeUntil(this.destroy$)).subscribe((feed) => { if (feed) { this.notifications.set(feed.items); this.unreadCount.set(feed.unread_count); } });

        this.router.events
            .pipe(
                filter((event): event is NavigationEnd => event instanceof NavigationEnd),
                takeUntil(this.destroy$)
            )
            .subscribe(() => {
                this.syncPageMeta();
                this.openActiveCategory();
                this.closeSidebar();
            });
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    openLogoutConfirm() {
        this.logoutConfirmVisible = true;
    }

    confirmLogout() {
        this.auth.logout();
        this.logoutConfirmVisible = false;
        this.router.navigate(['/auth/login']);
    }

    toggleSidebar() {
        this.sidebarOpen.update((value) => !value);
    }

    closeSidebar() {
        this.sidebarOpen.set(false);
    }

    toggleCategory(categoryId: string) {
        this.openCategories.update((current) => {
            const next = new Set(current);
            if (next.has(categoryId)) next.delete(categoryId);
            else next.add(categoryId);
            return next;
        });
    }

    isCategoryOpen(categoryId: string) {
        return this.openCategories().has(categoryId);
    }

    isCategoryActive(category: PanelNavCategory) {
        const currentUrl = this.router.url.split('?')[0].split('#')[0];
        return category.items.some((item) => currentUrl === item.route || currentUrl.startsWith(`${item.route}/`));
    }

    trackCategory = (_index: number, category: PanelNavCategory) => category.id;
    notificationCount(item: PanelNavItem) { return item.notificationKey ? this.notificationCounts()[item.notificationKey] ?? 0 : 0; }
    displayNotificationCount(item: PanelNavItem) { const count = this.notificationCount(item); return count > 99 ? '99+' : String(count); }
    trackNotification = (_index: number, item: UserNotification) => item.event_key;
    toggleNotifications(event: Event) { event.stopPropagation(); this.notificationsOpen.update((value) => !value); }
    openNotification(item: UserNotification) { this.notificationsService.read(item.event_key).subscribe(() => { this.notifications.update((items) => items.map((value) => value.event_key === item.event_key ? { ...value, read: true } : value)); this.unreadCount.set(this.notifications().filter((value) => !value.read).length); }); this.notificationsOpen.set(false); this.router.navigateByUrl(item.route); }
    markAllRead() { this.notificationsService.readAll().subscribe(() => { this.notifications.update((items) => items.map((item) => ({ ...item, read: true }))); this.unreadCount.set(0); }); }
    notificationTime(value: string) { const date = new Date(value); const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000)); if (seconds < 60) return 'Just now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return date.toLocaleDateString(); }

    @HostListener('document:click') closeNotifications() { this.notificationsOpen.set(false); }

    @HostListener('window:resize')
    onResize() {
        if (window.innerWidth > 991) {
            this.sidebarOpen.set(false);
        }
    }

    private accessContext() {
        const user = this.auth.user();
        return {
            roleName: user?.role.role_name ?? 'User',
            permissions: user?.role.permissions ?? [],
            assignedApprovalCount: this.notificationCounts().approval_review
        };
    }

    private syncPageMeta() {
        const snapshot = this.getDeepestSnapshot();
        const data = snapshot?.data ?? {};

        this.pageEyebrow.set((data['eyebrow'] as string) ?? 'Document workspace');
        this.pageTitle.set((data['title'] as string) ?? this.titleFromUrl(this.router.url));
        this.pageSubtitle.set((data['subtitle'] as string) ?? 'Manage this section from the panel.');
    }

    private openActiveCategory() {
        const active = this.visibleNavCategories().find((category) => this.isCategoryActive(category));
        if (!active || this.openCategories().has(active.id)) return;
        this.openCategories.update((current) => new Set([...current, active.id]));
    }

    private getDeepestSnapshot() {
        let current = this.route;

        while (current.firstChild) {
            current = current.firstChild;
        }

        return current.snapshot;
    }

    private titleFromUrl(url: string) {
        const segment = url.split('?')[0].split('#')[0].split('/').filter(Boolean).pop() ?? 'dashboard';

        switch (segment) {
            case 'documents':
                return 'Document';
            case 'softcopy-documents':
                return 'Softcopy Documents';
            case 'hardcopy-documents':
                return 'Hardcopy Documents';
            case 'softcopy-folders':
                return 'Softcopy Folders';
            case 'my-document-requests':
                return 'My Document Requests';
            case 'my-access-requests':
                return 'My Access Requests';
            case 'access-review':
                return 'Access Request Review';
            case 'approval-review':
                return 'Approval Requests';
            case 'my-disposal-requests':
                return 'My Disposal Requests';
            case 'hardcopy-transfers':
                return 'Hardcopy Transfer Requests';
            case 'hardcopy-transfer-review':
                return 'Hardcopy Transfer Review';
            case 'storage':
            case 'classification':
                return 'Storage and Classification';
            case 'disposal':
                return 'Document Disposal';
            case 'my-profile':
                return 'My Profile';
            case 'users':
                return 'User Management';
            case 'roles-permissions':
                return 'Roles and Permissions';
            case 'workflow-builder':
                return 'Workflow Builder';
            case 'backup-restore':
                return 'Backup, Restore and Reset';
            case 'audit-logs':
                return 'Audit and Activity Logs';
            case 'settings':
                return 'System Settings';
            default:
                return 'Dashboard';
        }
    }
}
