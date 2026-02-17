// Azure Cosmos DB Service for Audit Data
// Note: For browser apps, using REST API with master key has CORS and security limitations
// In production, use Azure Functions or a backend API to proxy requests

// Cosmos DB Configuration - Uses environment variables for security
// Set these in .env.local file (not committed to git)
const COSMOS_CONFIG = {
  endpoint: process.env.REACT_APP_COSMOS_ENDPOINT || 'https://audit.documents.azure.com:443/',
  key: process.env.REACT_APP_COSMOS_KEY || '',
  databaseId: process.env.REACT_APP_COSMOS_DATABASE || 'AuditResults',
  containerId: process.env.REACT_APP_COSMOS_CONTAINER || 'Audits'
};

// Note: For browser apps, we use the Web Crypto API to generate auth tokens
// In production, this should be handled by a backend service for security

// Transform Cosmos DB audit document to app format
export const transformAuditDocument = (doc) => {
  // Extract client name from document name or use audit ID
  const clientName = extractClientName(doc.primaryDocumentName) || `Audit ${doc.auditId?.substring(0, 8)}`;

  // Calculate pass status label
  const passStatusLabels = {
    0: 'approved',
    1: 'pending_review',
    2: 'rejected'
  };

  // Extract module name for display
  const moduleBName = doc.moduleBScore?.moduleName || 'Module B';

  return {
    id: doc.id || doc.auditId,
    auditId: doc.auditId,
    name: moduleBName, // Use Module B name as the specialization name
    shortName: moduleBName,
    type: 'Azure Specialization',
    status: passStatusLabels[doc.passStatus] || 'pending_review',
    complianceScore: doc.overallScore || 0,
    overallScore: doc.overallScore || 0,

    // Dates
    timestamp: doc.timestamp,
    dueDate: formatDate(addDays(new Date(doc.timestamp), 30)),
    slaDate: formatDate(addDays(new Date(doc.timestamp), 45)),
    lastReviewed: formatDate(new Date(doc.timestamp)),

    // Partner/Client info
    partner: clientName,
    clientName: clientName,
    primaryDocumentName: doc.primaryDocumentName,

    // Evidence counts
    evidenceItems: countTotalEvidence(doc),
    workloads: doc.moduleBScore?.totalControls || 0,

    // Module Scores
    moduleAScore: doc.moduleAScore,
    moduleBScore: doc.moduleBScore,

    // Findings & Recommendations
    findings: doc.findings || [],
    recommendations: doc.recommendations || [],
    keyStrengths: doc.keyStrengths || [],
    keyGaps: doc.keyGaps || [],

    // Executive Summary
    executiveSummary: doc.executiveSummary,

    // Checklist version
    checklistVersion: doc.checklistVersion,

    // For backward compatibility with existing UI
    certifications: extractCertifications(doc),
    assignedTo: null,
    workloadDetails: transformFindings(doc.findings),
    employees: []
  };
};

// Extract client name from document name
const extractClientName = (documentName) => {
  if (!documentName) return null;

  // Remove UUID prefix and file extension
  const cleaned = documentName
    .replace(/^[a-f0-9-]+_/, '') // Remove UUID prefix
    .replace(/\.docx?$/i, '')    // Remove .doc/.docx extension
    .replace(/_/g, ' ')          // Replace underscores with spaces
    .replace(/v\d+$/i, '')       // Remove version suffix
    .trim();

  return cleaned || null;
};

// Add days to a date
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Format date to YYYY-MM-DD
const formatDate = (date) => {
  if (!date || isNaN(date.getTime())) return 'N/A';
  return date.toISOString().split('T')[0];
};

// Count total evidence items
const countTotalEvidence = (doc) => {
  let count = 0;
  if (doc.findings) {
    doc.findings.forEach(finding => {
      count += (finding.evidenceFound?.length || 0);
    });
  }
  return count;
};

// Extract certifications from module info
const extractCertifications = (doc) => {
  const certs = [];
  if (doc.moduleBScore?.moduleName?.includes('AI')) {
    certs.push('AI-102', 'DP-100');
  }
  if (doc.moduleAScore?.moduleName?.includes('Cloud')) {
    certs.push('AZ-900');
  }
  return certs.length > 0 ? certs : ['AZ-900'];
};

// Transform findings to workload details format
const transformFindings = (findings) => {
  if (!findings) return [];

  return findings.slice(0, 5).map((finding, idx) => ({
    name: finding.controlName || `Control ${finding.controlId}`,
    controlId: finding.controlId,
    startDate: 'N/A',
    status: getStatusLabel(finding.status),
    uptime: finding.score || 0,
    score: finding.score || 0,
    evidenceFound: finding.evidenceFound || [],
    evidenceMissing: finding.evidenceMissing || []
  }));
};

// Get status label from numeric status
const getStatusLabel = (status) => {
  const labels = {
    0: 'Pass',
    1: 'Partial',
    2: 'Fail'
  };
  return labels[status] || 'Unknown';
};

// Generate authorization token for Cosmos DB REST API
const generateCosmosAuthToken = async (verb, resourceType, resourceLink, date, masterKey) => {
  const text = `${verb.toLowerCase()}\n${resourceType.toLowerCase()}\n${resourceLink}\n${date.toLowerCase()}\n\n`;

  // Decode the master key from base64
  const keyBuffer = Uint8Array.from(atob(masterKey), c => c.charCodeAt(0));

  // Import key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Sign the text
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(text));

  // Convert to base64
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  // URL encode the token
  return encodeURIComponent(`type=master&ver=1.0&sig=${signatureBase64}`);
};

// Fetch audits from Cosmos DB using REST API
export const fetchAuditsFromCosmosDB = async (config = COSMOS_CONFIG) => {
  // Check if credentials are configured
  if (!config.key) {
    console.log('Cosmos DB key not configured - returning empty array');
    return [];
  }

  try {
    const resourceLink = `dbs/${config.databaseId}/colls/${config.containerId}`;
    const resourceType = 'docs';
    const date = new Date().toUTCString();

    // Generate authorization token
    const authToken = await generateCosmosAuthToken(
      'GET',
      resourceType,
      resourceLink,
      date,
      config.key
    );

    const url = `${config.endpoint}${resourceLink}/docs`;

    console.log('Fetching from Cosmos DB:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authToken,
        'x-ms-date': date,
        'x-ms-version': '2018-12-31',
        'Content-Type': 'application/json',
        'x-ms-documentdb-query-enablecrosspartition': 'true'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cosmos DB error:', response.status, errorText);
      throw new Error(`Cosmos DB request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('Cosmos DB response:', data);

    return data.Documents || data._embedded || [];
  } catch (error) {
    console.error('Error fetching from Cosmos DB:', error);
    throw error;
  }
};

// Export configuration for runtime updates
export { COSMOS_CONFIG };

// Named exports for module
const cosmosDbService = {
  COSMOS_CONFIG,
  transformAuditDocument,
  fetchAuditsFromCosmosDB
};

export default cosmosDbService;
