// Run after npm run build:
// node scripts/check-document-details.cjs <path-to-playwright-package>
// All API traffic is intercepted. This check never writes to a real database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.argv[2] || 'playwright');
const root = path.resolve(__dirname, '../dist/sakai-ng/browser');
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'dts-details-check-'));
const user = { user_id: 'reviewer', username: 'reviewer', firstname: 'Alex', lastname: 'Reyes', role: { role_id: 'admin', role_name: 'Admin', permissions: [] } };
const revision = { revision_id: 'rev-1', revision_number: '02', file_name: 'Warehouse Records - stock Releasing Form-uncontrolled.xlsx', file_url: '/test.xlsx', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', created_at: '2026-09-09T02:00:00Z', approved_at: '2026-09-09T02:05:00Z', uploader: user, is_current: true };
const attachment = { attachment_id: 'scan-1', file_name: 'Approval scan.png', file_url: '/test.png', mime_type: 'image/png', status: 'Approved', created_at: revision.created_at };
const step = { workflow_step_id: 'step-1', stage: 'NOTED_BY', stage_label: 'Department review', status: 'PENDING', assignee: user };
let record = {
    document_id: 'doc-1', document_title: 'Document control procedure and records management',
    document_number: 'DTS-QA-001', document_type: 'SOFTCOPY', status: 'Completed',
    created_at: revision.created_at, creator: user, requester: user,
    workflow_steps: [step], approver_configuration: { workflow_name: 'Document approval', workflow_version: 6 },
    softcopy: { current_revision: revision, revisions: [revision], category: { category_name: 'Quality / Procedures' }, attachments: [attachment] },
    assignments: []
};
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({ headless: true, ...(process.env.DTS_BROWSER_PATH ? { executablePath: process.env.DTS_BROWSER_PATH } : {}) });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        page.setDefaultTimeout(10_000);
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(user => {
            localStorage.setItem('dtm_auth_token_v2', 'browser-fixture-only');
            localStorage.setItem('dtm_auth_user_v2', JSON.stringify(user));
        }, user);
        const pageData = items => ({ items, meta: { total: items.length, total_pages: 1, page: 1, limit: 1000 } });
        await page.route('**/api/v1/**', async route => {
            const url = new URL(route.request().url());
            const endpoint = url.pathname.replace('/api/v1', '');
            let data = pageData([]);
            if (endpoint === '/auth/me') data = user;
            else if (endpoint === '/documents/doc-1') data = record;
            else if (endpoint === '/documents/doc-1/revisions') data = record.document_type === 'SOFTCOPY' ? [revision] : [];
            else if (endpoint === '/documents') data = pageData([record]);
            else if (endpoint === '/users') data = pageData([user]);
            else if (endpoint.includes('/system-settings')) data = {};
            if (route.request().method() !== 'GET') {
                return route.fulfill({ status: 409, json: { message: 'Approver changed. Refresh and try again.' } });
            }
            return route.fulfill({ json: { success: true, data } });
        });
        const open = async () => {
            await page.goto(base + '/panel/documents?document=doc-1');
            await page.locator('.document-details-dialog').waitFor();
        };
        const dialog = page.locator('.document-details-dialog');
        const switchTab = async name => {
            const tab = dialog.getByRole('tab', { name });
            await tab.click();
            const id = await tab.getAttribute('id');
            await dialog.locator(`[role="tabpanel"][aria-labelledby="${id}"][data-p-active="true"]`).waitFor({ state: 'visible' });
        };
        const noOverflow = async () => assert(await dialog.evaluate(el => {
            const content = el.querySelector('.p-dialog-content');
            return content.scrollWidth <= content.clientWidth + 1 && el.getBoundingClientRect().right <= innerWidth;
        }), 'Dialog must fit without horizontal scrolling');
        await open();
        await noOverflow();
        assert.equal(await dialog.locator('h2').innerText(), record.document_title);
        await switchTab(/^Files/);
        assert.equal(await dialog.locator('.attachment-row').count(), 1);
        assert.equal(await dialog.locator('a button').count(), 0, 'Delete must be separate from preview');
        await switchTab('Overview');
        await dialog.locator('.metadata-section-heading').waitFor({ state: 'visible' });
        await dialog.locator('.metadata-section-heading').press('Enter');
        await dialog.locator('.softcopy-record-section[open]').waitFor({ state: 'visible' });
        assert.equal(await dialog.locator('.softcopy-record-section').getAttribute('open'), '');
        await switchTab(/^Workflow/);
        await dialog.locator('.workflow-reassign-controls summary').click();
        await dialog.getByLabel('Replacement approver').selectOption('reviewer');
        await dialog.getByLabel('Reason for reassignment').fill('Covering the reviewer');
        await dialog.locator('.workflow-reassign-controls button').click();
        await dialog.getByRole('alert').filter({ hasText: 'Approver changed' }).waitFor();
        await page.locator('.modern-alert-dialog').getByRole('button', { name: 'Close', exact: true }).click();
        await page.locator('.modern-alert-dialog').waitFor({ state: 'hidden' });
        await dialog.locator('.workflow-reassign-controls summary').click();
        await switchTab('Overview');
        await dialog.locator('.metadata-section-heading').click();
        await dialog.locator('.digital-file-actions').getByRole('button', { name: 'Open file' }).click();
        await dialog.locator('.file-preview-panel [role=alert]').waitFor();
        await page.locator('.modern-alert-dialog').getByRole('button', { name: 'Close', exact: true }).click();
        await page.locator('.modern-alert-dialog').waitFor({ state: 'hidden' });
        await dialog.getByRole('button', { name: 'Close preview', exact: true }).click();
        await dialog.locator('.file-preview-panel').waitFor({ state: 'detached' });
        assert.equal(await dialog.locator('.file-preview-panel').count(), 0);
        await dialog.locator('.revision-summary').click();
        assert(await dialog.locator('.revision-actions').getByRole('button', { name: 'Open file' }).isVisible());
        assert(await dialog.locator('.revision-actions').getByRole('button', { name: 'Download file' }).isVisible());
        assert.equal(await dialog.locator('.revision-actions').getByRole('button', { name: /controlled|uncontrolled/i }).count(), 0);
        assert(!/controlled|uncontrolled/i.test(await dialog.locator('.revision-card').innerText()), 'Legacy copy labels must not be shown');
        await dialog.locator('.revision-summary').click();
        await switchTab('Overview');
        await dialog.locator('.p-dialog-content').evaluate(el => el.scrollTop = 0);
        await page.screenshot({ path: path.join(artifacts, 'softcopy-desktop.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        await noOverflow();
        await page.screenshot({ path: path.join(artifacts, 'softcopy-mobile.png') });
        await page.evaluate(() => document.documentElement.classList.add('app-dark'));
        await page.screenshot({ path: path.join(artifacts, 'softcopy-dark.png') });
        await dialog.getByRole('tab', { name: 'Overview', exact: true }).focus();
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        record = { ...record, document_type: 'HARDCOPY', softcopy: null, status: 'Completed', workflow_steps: [], hardcopy: { area: { area_name: 'Production' }, specific: { specific_name: 'Quality records' }, asset: { asset_number: 'CAB-04' }, location: { location_name: 'Shelf 2' }, sequence: { sequence_code: '001' }, attachments: [] } };
        await open();
        await noOverflow();
        assert.equal(await dialog.locator('.storage-fields dd').count(), 5);
        assert.equal(await dialog.locator('.storage-fields dd').last().innerText(), '001');
        await page.setViewportSize({ width: 1440, height: 1000 });
        await noOverflow();
        await page.screenshot({ path: path.join(artifacts, 'hardcopy-desktop.png') });
        await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
        await dialog.waitFor({ state: 'hidden' });
        assert.deepEqual(errors, []);
        console.log('PASS: desktop/mobile layout, keyboard disclosure, workflow error, approved file actions, attachment targets, Escape and Close.');
        console.log('Screenshots: ' + artifacts);
    } catch (error) {
        const page = browser.contexts()[0]?.pages()[0];
        if (page) {
            await page.screenshot({ path: path.join(artifacts, 'failure.png') });
            console.error(await page.locator('.document-details-dialog').innerText().catch(() => 'Modal is closed'));
            console.error('Screenshots: ' + artifacts);
        }
        throw error;
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
