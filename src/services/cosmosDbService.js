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

      // If CORS error or auth fails, fall back to sample data
      if (response.status === 0 || response.status === 401 || response.status === 403) {
        console.log('Falling back to sample data due to CORS/Auth issues');
        return [getSampleCosmosAudit()];
      }
      throw new Error(`Cosmos DB request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('Cosmos DB response:', data);

    return data.Documents || data._embedded || [];
  } catch (error) {
    console.error('Error fetching from Cosmos DB:', error);

    // Check if it's a CORS error (common in browser apps)
    if (error.message.includes('CORS') || error.message.includes('NetworkError') || error.name === 'TypeError') {
      console.log('CORS issue detected. For browser apps, consider:');
      console.log('1. Using Azure Functions as a proxy');
      console.log('2. Enabling CORS on Cosmos DB (limited)');
      console.log('3. Using resource tokens instead of master key');
      console.log('Returning sample data for demo purposes...');
      return [getSampleCosmosAudit()];
    }

    throw error;
  }
};

// Sample audit data based on the provided schema
export const getSampleCosmosAudit = () => {
  return {
    "id": "90ca5096-98dc-4e44-9c2e-1756c5ea223d",
    "auditId": "90ca5096-98dc-4e44-9c2e-1756c5ea223d",
    "timestamp": "2026-02-13T19:20:09.5460776Z",
    "checklistVersion": "1.8",
    "primaryDocumentName": "e6e20752-1bc0-44d3-a4ab-0cef8e885e33_Azure_RAG_Solution_Portfolio_Assessment_v3.docx",
    "secondaryDocumentName": null,
    "overallScore": 35,
    "passStatus": 2,
    "moduleAScore": {
      "moduleId": "A",
      "moduleName": "Azure Essentials Cloud Foundation",
      "score": 57.49999999999999,
      "maxScore": 100,
      "weightedScore": 23,
      "totalControls": 7,
      "passedControls": 1,
      "partialControls": 6,
      "failedControls": 0,
      "controlScores": [
        { "controlId": "A-1.1", "controlName": "Cloud & AI Adoption Business Strategy", "score": 100, "weight": 6, "weightedScore": 6, "status": 0 },
        { "controlId": "A-1.2", "controlName": "Cloud & AI Adoption Plan", "score": 50, "weight": 6, "weightedScore": 3, "status": 1 },
        { "controlId": "A-2.1", "controlName": "Security & Governance Tooling", "score": 50, "weight": 7, "weightedScore": 3.5, "status": 1 },
        { "controlId": "A-2.2", "controlName": "Well-Architected Workloads", "score": 50, "weight": 7, "weightedScore": 3.5, "status": 1 },
        { "controlId": "A-3.1", "controlName": "Repeatable Deployment", "score": 50, "weight": 7, "weightedScore": 3.5, "status": 1 },
        { "controlId": "A-3.2", "controlName": "Plan for Skilling", "score": 50, "weight": 3, "weightedScore": 1.5, "status": 1 },
        { "controlId": "A-3.3", "controlName": "Operations Management Tooling", "score": 50, "weight": 4, "weightedScore": 2, "status": 1 }
      ]
    },
    "moduleBScore": {
      "moduleId": "B",
      "moduleName": "AI Platform on Microsoft Azure",
      "score": 20,
      "maxScore": 100,
      "weightedScore": 12,
      "totalControls": 7,
      "passedControls": 0,
      "partialControls": 2,
      "failedControls": 5,
      "controlScores": [
        { "controlId": "B-1.1", "controlName": "Portfolio Assessment", "score": 50, "weight": 12, "weightedScore": 6, "status": 1 },
        { "controlId": "B-2.1", "controlName": "Solution Design", "score": 50, "weight": 12, "weightedScore": 6, "status": 1 },
        { "controlId": "B-2.2", "controlName": "Well-Architected Review", "score": 0, "weight": 8, "weightedScore": 0, "status": 2 },
        { "controlId": "B-2.3", "controlName": "Proof of Concept", "score": 0, "weight": 8, "weightedScore": 0, "status": 2 },
        { "controlId": "B-3.1", "controlName": "Deployment", "score": 0, "weight": 10, "weightedScore": 0, "status": 2 },
        { "controlId": "B-4.1", "controlName": "Service Validation and Testing", "score": 0, "weight": 5, "weightedScore": 0, "status": 2 },
        { "controlId": "B-4.2", "controlName": "Post-deployment Documentation", "score": 0, "weight": 5, "weightedScore": 0, "status": 2 }
      ]
    },
    "findings": [
      {
        "controlId": "A-1.1",
        "controlName": "Cloud & AI Adoption Business Strategy",
        "status": 0,
        "score": 100,
        "evidenceFound": ["finops review", "case assessment", "business strategy document"],
        "evidenceMissing": [],
        "recommendations": []
      },
      {
        "controlId": "A-1.2",
        "controlName": "Cloud & AI Adoption Plan",
        "status": 1,
        "score": 50,
        "evidenceFound": ["cost management report", "finops analysis", "preliminary adoption plan"],
        "evidenceMissing": ["pricing calculator output", "detailed devops assessment report", "finalized project planning document"],
        "recommendations": ["Complete the pricing calculator output", "Enhance project planning section"]
      },
      {
        "controlId": "B-1.1",
        "controlName": "Portfolio Assessment",
        "status": 1,
        "score": 50,
        "evidenceFound": ["business need identification", "description of current challenges"],
        "evidenceMissing": ["comprehensive AI readiness analysis", "data governance strategies"],
        "recommendations": ["Include detailed AI use cases report", "Develop data governance framework"]
      },
      {
        "controlId": "B-2.1",
        "controlName": "Solution Design",
        "status": 1,
        "score": 50,
        "evidenceFound": ["RAG solution architecture overview", "RAI implementation elements"],
        "evidenceMissing": ["detailed HLD and LLD documents", "comprehensive impact assessment"],
        "recommendations": ["Create detailed HLD and LLD documents", "Conduct complete impact assessment"]
      },
      {
        "controlId": "B-2.2",
        "controlName": "Well-Architected Review",
        "status": 2,
        "score": 0,
        "evidenceFound": [],
        "evidenceMissing": ["completed Well-Architected review document"],
        "recommendations": ["Perform Well-Architected review for RAG solution"]
      }
    ],
    "keyStrengths": ["Cloud & AI Adoption Business Strategy: Strong evidence found"],
    "keyGaps": [
      "Cloud & AI Adoption Plan: pricing calculator output",
      "Security & Governance Tooling: security baseline documentation",
      "Well-Architected Workloads: WAR documentation"
    ],
    "recommendations": [
      "Include a detailed report on AI use cases and their relevance",
      "Develop and document a data governance framework",
      "Create detailed HLD and LLD documents",
      "Perform a well-architected review",
      "Create deployment documentation",
      "Establish testing protocols",
      "Develop SOPs and runbooks"
    ],
    "executiveSummary": "## Executive Summary\n\n**Audit Result: FAIL**\n**Overall Score: 35.0%**\n\n### Module Scores\n- Module A (Azure Essentials Cloud Foundation): 57.5%\n- Module B (AI Platform on Microsoft Azure): 20.0%"
  };
};

// Export configuration for runtime updates
export { COSMOS_CONFIG };

// Named exports for module
const cosmosDbService = {
  COSMOS_CONFIG,
  transformAuditDocument,
  fetchAuditsFromCosmosDB,
  getSampleCosmosAudit
};

export default cosmosDbService;
