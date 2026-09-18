import { DocumentDetailDialogComponent } from './document-detail-dialog.component';
import * as XLSX from 'xlsx';

describe('DocumentDetailDialogComponent file access', () => {
    const createDialog = (status: string, canAccessFiles: boolean) => {
        const dialog = Object.create(DocumentDetailDialogComponent.prototype) as DocumentDetailDialogComponent;
        dialog.document = { document_id: '1', document_type: 'SOFTCOPY', status } as any;
        dialog.canAccessFiles = canAccessFiles;
        return dialog;
    };

    it('allows an assigned approval reviewer to open the pending submitted revision', () => {
        const dialog = createDialog('ForApproval', true);
        const revision = {
            revision_id: 'revision-1',
            file_name: 'submitted.docx',
            file_url: '/uploads/submitted.docx',
            approved_at: null,
            is_current: true,
        } as any;

        expect(dialog.canAccessApprovedFile(revision)).toBeTrue();
    });

    it('does not expose pending files without the approval file-access scope', () => {
        const dialog = createDialog('ForApproval', false);
        const revision = { revision_id: 'revision-1', file_url: '/uploads/submitted.docx' } as any;

        expect(dialog.canAccessApprovedFile(revision)).toBeFalse();
    });

    it('previews legacy xls workbooks without treating them as zip archives', async () => {
        const dialog = Object.create(DocumentDetailDialogComponent.prototype) as any;
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Header'], ['Value']]), 'Sheet1');
        const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xls' });

        const html = await dialog.buildOfficePreview(buffer, {
            revision_id: 'revision-1',
            revision_number: '01',
            file_name: 'legacy.xls',
        });

        expect(html).toContain('Sheet1');
        expect(html).toContain('Value');
    });
});
