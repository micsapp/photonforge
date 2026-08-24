// Minimal ambient declarations for File System Access API members
// not present in the default TS DOM lib.

interface FileSystemFileHandle {
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>
  remove(): Promise<void>
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
  values(): AsyncIterableIterator<FileSystemHandle>
  queryPermission(desc?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(desc?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
}

interface Window {
  showDirectoryPicker?: (options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: unknown
  }) => Promise<FileSystemDirectoryHandle>
}
