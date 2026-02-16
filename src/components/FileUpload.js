import React, { useState, useRef, useCallback } from 'react';
import { ContainerClient } from '@azure/storage-blob';

// Azure Blob Storage Configuration - Uses environment variables for security
// Set these in .env.local file (not committed to git)
const AZURE_STORAGE_CONFIG = {
  accountName: process.env.REACT_APP_AZURE_STORAGE_ACCOUNT || '',
  containerName: process.env.REACT_APP_AZURE_CONTAINER_NAME || 'auditfiles',
  sasToken: process.env.REACT_APP_AZURE_STORAGE_SAS_TOKEN || ''
};

// Styles for the FileUpload component
const styles = {
  container: {
    padding: '24px'
  },
  uploadZone: {
    border: '2px dashed #cbd5e1',
    borderRadius: '16px',
    padding: '40px 24px',
    textAlign: 'center',
    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
    transition: 'all 0.3s ease',
    cursor: 'pointer'
  },
  uploadZoneDragOver: {
    border: '2px dashed #3b82f6',
    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
    transform: 'scale(1.01)'
  },
  uploadIcon: {
    width: '80px',
    height: '80px',
    margin: '0 auto 20px',
    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(59, 130, 246, 0.3)'
  },
  uploadTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: '8px'
  },
  uploadSubtitle: {
    fontSize: '14px',
    color: '#64748b',
    marginBottom: '20px'
  },
  browseBtn: {
    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    color: '#fff',
    border: 'none',
    padding: '12px 32px',
    borderRadius: '10px',
    fontWeight: '700',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease'
  },
  fileTypes: {
    marginTop: '20px',
    fontSize: '12px',
    color: '#94a3b8'
  },
  fileList: {
    marginTop: '24px'
  },
  fileListHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  fileListTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#1e293b'
  },
  clearBtn: {
    background: 'transparent',
    border: '1px solid #e2e8f0',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#64748b',
    cursor: 'pointer'
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    marginBottom: '8px',
    gap: '12px'
  },
  fileIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px'
  },
  fileInfo: {
    flex: 1
  },
  fileName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '2px'
  },
  fileMeta: {
    fontSize: '12px',
    color: '#64748b'
  },
  fileStatus: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '700'
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '4px 8px'
  },
  progressBar: {
    width: '100%',
    height: '4px',
    background: '#e2e8f0',
    borderRadius: '2px',
    marginTop: '8px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3b82f6, #22c55e)',
    borderRadius: '2px',
    transition: 'width 0.3s ease'
  },
  uploadActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '20px',
    justifyContent: 'flex-end'
  },
  uploadBtn: {
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#fff',
    border: 'none',
    padding: '14px 32px',
    borderRadius: '10px',
    fontWeight: '700',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
};

// File type icons
const getFileIcon = (fileName) => {
  const ext = fileName.split('.').pop().toLowerCase();
  const iconMap = {
    pdf: { icon: '📄', bg: '#fee2e2', color: '#dc2626' },
    doc: { icon: '📝', bg: '#dbeafe', color: '#2563eb' },
    docx: { icon: '📝', bg: '#dbeafe', color: '#2563eb' },
    xls: { icon: '📊', bg: '#dcfce7', color: '#16a34a' },
    xlsx: { icon: '📊', bg: '#dcfce7', color: '#16a34a' },
    csv: { icon: '📈', bg: '#dcfce7', color: '#16a34a' },
    png: { icon: '🖼️', bg: '#fef3c7', color: '#d97706' },
    jpg: { icon: '🖼️', bg: '#fef3c7', color: '#d97706' },
    jpeg: { icon: '🖼️', bg: '#fef3c7', color: '#d97706' },
    zip: { icon: '📦', bg: '#f3e8ff', color: '#9333ea' },
    json: { icon: '{ }', bg: '#fef3c7', color: '#d97706' }
  };
  return iconMap[ext] || { icon: '📎', bg: '#f1f5f9', color: '#64748b' };
};

// Format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const FileUpload = ({ auditId, auditName, onUploadComplete }) => {
  const [files, setFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [config] = useState(AZURE_STORAGE_CONFIG);
  const fileInputRef = useRef(null);

  // Check if Azure config is properly set
  const isConfigured = config.accountName && config.sasToken;

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    addFiles(selectedFiles);
  };

  const addFiles = (newFiles) => {
    const fileObjects = newFiles.map(file => ({
      id: Date.now() + Math.random(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'pending', // pending, uploading, success, error
      progress: 0,
      uploadedUrl: null
    }));
    setFiles(prev => [...prev, ...fileObjects]);
  };

  const removeFile = (fileId) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const clearFiles = () => {
    setFiles([]);
  };

  const uploadToAzureBlob = async (fileObj) => {
    // Validate configuration
    if (!config.accountName) {
      throw new Error('Azure Storage Account not configured. Check .env.local file.');
    }
    if (!config.sasToken) {
      throw new Error('Azure SAS Token not configured. Check .env.local file.');
    }

    try {
      // Build container URL using account name, container name, and SAS token
      // Format: https://<accountName>.blob.core.windows.net/<containerName>?<sasToken>
      const containerUrl = `https://${config.accountName}.blob.core.windows.net/${config.containerName}?${config.sasToken}`;

      console.log('Uploading to:', `https://${config.accountName}.blob.core.windows.net/${config.containerName}/...`);

      // Create Container Client with SAS URL
      const containerClient = new ContainerClient(containerUrl);

      // Create unique blob name directly in container (no subfolders)
      const blobName = `${auditId || 'general'}-${Date.now()}-${fileObj.name}`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // Upload with progress tracking
      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: fileObj.type
        },
        onProgress: (progress) => {
          const percent = Math.round((progress.loadedBytes / fileObj.size) * 100);
          setFiles(prev => prev.map(f =>
            f.id === fileObj.id ? { ...f, progress: percent } : f
          ));
        }
      };

      await blockBlobClient.uploadData(fileObj.file, uploadOptions);

      console.log('Upload successful:', blobName);
      return blockBlobClient.url.split('?')[0]; // Return URL without SAS token
    } catch (error) {
      console.error('Upload error:', error);
      // Provide more helpful error messages
      if (error.message.includes('AuthorizationFailure') || error.message.includes('403')) {
        throw new Error('Authorization failed. SAS token may be expired or have wrong permissions.');
      }
      if (error.message.includes('ContainerNotFound') || error.message.includes('404')) {
        throw new Error(`Container "${config.containerName}" not found. Check container name.`);
      }
      if (error.message.includes('CORS') || error.name === 'TypeError') {
        throw new Error('CORS error. Enable CORS on Azure Storage Account.');
      }
      throw error;
    }
  };

  const handleUpload = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    for (const fileObj of pendingFiles) {
      setFiles(prev => prev.map(f =>
        f.id === fileObj.id ? { ...f, status: 'uploading' } : f
      ));

      try {
        const uploadedUrl = await uploadToAzureBlob(fileObj);
        setFiles(prev => prev.map(f =>
          f.id === fileObj.id
            ? { ...f, status: 'success', progress: 100, uploadedUrl }
            : f
        ));
      } catch (error) {
        setUploadError(error.message);
        setFiles(prev => prev.map(f =>
          f.id === fileObj.id
            ? { ...f, status: 'error', errorMessage: error.message }
            : f
        ));
      }
    }

    setIsUploading(false);

    if (onUploadComplete) {
      const successfulUploads = files.filter(f => f.status === 'success');
      onUploadComplete(successfulUploads);
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'success':
        return { background: '#dcfce7', color: '#166534' };
      case 'error':
        return { background: '#fee2e2', color: '#991b1b' };
      case 'uploading':
        return { background: '#dbeafe', color: '#1e40af' };
      default:
        return { background: '#f1f5f9', color: '#64748b' };
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'success': return 'Uploaded';
      case 'error': return 'Failed';
      case 'uploading': return 'Uploading...';
      default: return 'Ready';
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: '700', color: '#1e293b' }}>
          Upload Audit Evidence
        </h3>
        <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
          {auditName ? `Uploading evidence for: ${auditName}` : 'Upload files to Azure Blob Storage for audit verification'}
        </p>
      </div>

      {/* Configuration Warning - Only show in development */}
      {!isConfigured && (
        <div style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)',
          border: '1px solid #3b82f6',
          borderRadius: '12px',
          marginBottom: '16px',
          fontSize: '13px',
          color: '#1e40af'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>☁️</span>
            <strong style={{ fontSize: '15px' }}>Demo Mode</strong>
          </div>
          <p style={{ margin: '0 0 8px 0' }}>
            File upload to Azure Blob Storage is available when running locally with configured credentials.
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: '#3b82f6' }}>
            For local setup: Create <code style={{ background: '#fff', padding: '2px 6px', borderRadius: '4px' }}>.env.local</code> with
            REACT_APP_AZURE_STORAGE_ACCOUNT and REACT_APP_AZURE_STORAGE_SAS_TOKEN
          </p>
        </div>
      )}

      {/* Upload Error */}
      {uploadError && (
        <div style={{
          padding: '12px 16px',
          background: '#fee2e2',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '13px',
          color: '#991b1b'
        }}>
          <strong>Upload Error:</strong> {uploadError}
        </div>
      )}

      {/* Upload Zone */}
      <div
        style={{
          ...styles.uploadZone,
          ...(isDragOver ? styles.uploadZoneDragOver : {})
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div style={styles.uploadIcon}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div style={styles.uploadTitle}>Drag & Drop Files Here</div>
        <div style={styles.uploadSubtitle}>or click to browse from your computer</div>
        <button
          style={styles.browseBtn}
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          Browse Files
        </button>
        <div style={styles.fileTypes}>
          Supported: PDF, DOC, DOCX, XLS, XLSX, CSV, PNG, JPG, JSON, ZIP
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileSelect}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.json,.zip"
        />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div style={styles.fileList}>
          <div style={styles.fileListHeader}>
            <span style={styles.fileListTitle}>
              Selected Files ({files.length})
            </span>
            <button style={styles.clearBtn} onClick={clearFiles}>
              Clear All
            </button>
          </div>

          {files.map(fileObj => {
            const icon = getFileIcon(fileObj.name);
            return (
              <div key={fileObj.id} style={styles.fileItem}>
                <div style={{ ...styles.fileIcon, background: icon.bg, color: icon.color }}>
                  {icon.icon}
                </div>
                <div style={styles.fileInfo}>
                  <div style={styles.fileName}>{fileObj.name}</div>
                  <div style={styles.fileMeta}>{formatFileSize(fileObj.size)}</div>
                  {fileObj.status === 'uploading' && (
                    <div style={styles.progressBar}>
                      <div style={{ ...styles.progressFill, width: `${fileObj.progress}%` }} />
                    </div>
                  )}
                </div>
                <span style={{ ...styles.fileStatus, ...getStatusStyle(fileObj.status) }}>
                  {getStatusLabel(fileObj.status)}
                </span>
                {fileObj.status === 'pending' && (
                  <button style={styles.removeBtn} onClick={() => removeFile(fileObj.id)}>
                    ×
                  </button>
                )}
              </div>
            );
          })}

          <div style={styles.uploadActions}>
            <button
              style={{
                ...styles.uploadBtn,
                opacity: isUploading || !files.some(f => f.status === 'pending') ? 0.6 : 1
              }}
              onClick={handleUpload}
              disabled={isUploading || !files.some(f => f.status === 'pending')}
            >
              {isUploading ? (
                <>
                  <span>⏳</span> Submitting...
                </>
              ) : (
                <>
                  <span>📤</span> Submit
                </>
              )}
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default FileUpload;
