export interface FolderTreeNavigationNode {
    id: string;
    documents: readonly { document_id: string }[];
    children: readonly FolderTreeNavigationNode[];
}

export function folderIdsToExpandForDocuments(
    folders: readonly FolderTreeNavigationNode[],
    documentIds: ReadonlySet<string>
) {
    const expanded: string[] = [];

    const containsMatch = (folder: FolderTreeNavigationNode): boolean =>
        folder.documents.some((document) => documentIds.has(document.document_id))
        || folder.children.some((child) => containsMatch(child));

    const visit = (folder: FolderTreeNavigationNode) => {
        if (!containsMatch(folder)) return;
        expanded.push(folder.id);
        folder.children.forEach(visit);
    };

    folders.forEach(visit);
    return expanded;
}
