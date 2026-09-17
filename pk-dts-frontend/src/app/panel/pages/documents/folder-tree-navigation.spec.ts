import { folderIdsToExpandForDocuments } from './folder-tree-navigation';

describe('folder tree navigation', () => {
    it('expands every ancestor of a matching document', () => {
        const folders = [
            {
                id: 'softcopy:policies',
                documents: [],
                children: [{ id: 'softcopy:policies:hr', documents: [{ document_id: 'softcopy-1' }], children: [] }]
            },
            {
                id: 'hardcopy:records',
                documents: [],
                children: [{ id: 'hardcopy:records:archive', documents: [{ document_id: 'hardcopy-1' }], children: [] }]
            }
        ];

        expect(folderIdsToExpandForDocuments(folders, new Set(['softcopy-1', 'hardcopy-1']))).toEqual([
            'softcopy:policies',
            'softcopy:policies:hr',
            'hardcopy:records',
            'hardcopy:records:archive'
        ]);
    });

    it('does not expand unrelated folders', () => {
        const folders = [{
            id: 'root',
            documents: [{ document_id: 'other' }],
            children: [{ id: 'nested', documents: [{ document_id: 'target' }], children: [] }]
        }];

        expect(folderIdsToExpandForDocuments(folders, new Set(['target']))).toEqual(['root', 'nested']);
    });
});
