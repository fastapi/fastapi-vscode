export interface Workspace {
  getFastAPIEntrypoint(folderUri: string): string | undefined
  findFiles(
    folderUri: string,
    include: string,
    exclude?: string,
  ): Promise<string[]>
  workspaceFolders: WorkspaceFolder[] | undefined
  showWarning(message: string): void
  getActiveEditor(): string | null
}

export interface WorkspaceFolder {
  uri: string
  name: string
}
