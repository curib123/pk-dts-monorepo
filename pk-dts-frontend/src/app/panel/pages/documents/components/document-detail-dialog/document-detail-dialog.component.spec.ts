import { DocumentDetailDialogComponent } from './document-detail-dialog.component';

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
});
