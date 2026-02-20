// Azure Cosmos DB Service for Audit Data
// Note: For browser apps, using REST API with master key has CORS and security limitations
// In production, use Azure Functions or a backend API to proxy requests

// Cosmos DB Configuration - Uses environment variables for security
// Set these in .env.local file (not committed to git)
// In development, we use a proxy to avoid CORS issues
const isDevelopment = process.env.NODE_ENV === 'development';
const COSMOS_CONFIG = {
  endpoint: isDevelopment
    ? '/cosmos-api/'
    : (process.env.REACT_APP_COSMOS_ENDPOINT || 'https://audit.documents.azure.com:443/'),
  actualEndpoint: process.env.REACT_APP_COSMOS_ENDPOINT || 'https://audit.documents.azure.com:443/',
  key: process.env.REACT_APP_COSMOS_KEY || '',
  databaseId: process.env.REACT_APP_COSMOS_DATABASE || 'AuditResults',
  containerId: process.env.REACT_APP_COSMOS_CONTAINER || 'Audits'
};

// Note: For browser apps, we use the Web Crypto API to generate auth tokens
// In production, this should be handled by a backend service for security

// Transform Cosmos DB audit document to app format
// Updated to match actual document structure from AuditPlatformDB
export const transformAuditDocument = (doc) => {
  // Parse the generatedAt date
  const generatedDate = doc.generatedAt ? new Date(doc.generatedAt) : new Date();

  // Determine status based on overall percentage
  const overallScore = doc.overallPercentage || 0;
  let status = 'pending_review';
  if (overallScore >= 90) status = 'approved';
  else if (overallScore < 70) status = 'rejected';

  // Parse gapReport string into structured findings
  const parsedFindings = parseGapReport(doc.gapReport);

  // Parse recommendations string into array
  const parsedRecommendations = parseRecommendations(doc.recommendations);

  // Extract strengths and gaps from executive summary
  const { strengths, gaps } = parseExecutiveSummary(doc.executiveSummary);

  // Create a display name from audit ID
  const displayName = `Audit ${doc.auditId?.split('-').slice(-1)[0] || doc.id?.substring(0, 8)}`;

  // Split findings into Module A and Module B
  const moduleAFindings = parsedFindings.filter(f => f.controlId.startsWith('A-'));
  const moduleBFindings = parsedFindings.filter(f => f.controlId.startsWith('B-'));

  // Calculate module stats
  const moduleAStats = calculateModuleStats(moduleAFindings, doc.moduleAPercentage);
  const moduleBStats = calculateModuleStats(moduleBFindings, doc.moduleBPercentage);

  return {
    id: doc.id || doc.auditId,
    auditId: doc.auditId,
    name: 'Azure AI Specialization',
    shortName: 'AI Spec',
    type: 'Azure Specialization',
    status: status,
    complianceScore: Math.round(overallScore * 10) / 10,
    overallScore: Math.round(overallScore * 10) / 10,

    // Dates
    timestamp: doc.generatedAt,
    generatedAt: doc.generatedAt,
    dueDate: formatDate(addDays(generatedDate, 30)),
    slaDate: formatDate(addDays(generatedDate, 45)),
    lastReviewed: formatDate(generatedDate),

    // Partner/Client info - use audit ID as identifier
    partner: displayName,
    clientName: displayName,

    // Module Scores with full structure for UI
    moduleAScore: {
      moduleName: 'Foundation',
      score: Math.round((doc.moduleAPercentage || 0) * 10) / 10,
      passedControls: moduleAStats.passed,
      partialControls: moduleAStats.partial,
      failedControls: moduleAStats.failed,
      totalControls: moduleAFindings.length || 7,
      controlScores: moduleAFindings.map(f => ({
        controlId: f.controlId,
        controlName: f.description?.substring(0, 50) || `Control ${f.controlId}`,
        score: f.score,
        weight: 1,
        status: f.score >= 90 ? 'Pass' : f.score >= 70 ? 'Partial' : 'Fail'
      }))
    },
    moduleBScore: {
      moduleName: 'Implementation',
      score: Math.round((doc.moduleBPercentage || 0) * 10) / 10,
      passedControls: moduleBStats.passed,
      partialControls: moduleBStats.partial,
      failedControls: moduleBStats.failed,
      totalControls: moduleBFindings.length || 7,
      controlScores: moduleBFindings.map(f => ({
        controlId: f.controlId,
        controlName: f.description?.substring(0, 50) || `Control ${f.controlId}`,
        score: f.score,
        weight: 1,
        status: f.score >= 90 ? 'Pass' : f.score >= 70 ? 'Partial' : 'Fail'
      }))
    },
    moduleAPercentage: Math.round((doc.moduleAPercentage || 0) * 10) / 10,
    moduleBPercentage: Math.round((doc.moduleBPercentage || 0) * 10) / 10,

    // Questions count
    totalQuestions: doc.totalQuestions || 14,
    evidenceItems: parsedFindings.length,
    workloads: doc.totalQuestions || 14,

    // Findings & Recommendations (parsed from strings)
    findings: parsedFindings,
    recommendations: parsedRecommendations,
    keyStrengths: strengths,
    keyGaps: gaps,

    // Raw content for display
    gapReport: doc.gapReport,
    executiveSummary: doc.executiveSummary,
    recommendationsRaw: doc.recommendations,

    // Checklist version
    checklistVersion: doc.checklistVersion,

    // For backward compatibility with existing UI
    certifications: ['AI-102', 'DP-100', 'AZ-900'],
    assignedTo: null,
    workloadDetails: parsedFindings.slice(0, 5).map(f => ({
      name: f.controlName,
      controlId: f.controlId,
      startDate: 'N/A',
      status: f.score >= 90 ? 'Pass' : f.score >= 70 ? 'Partial' : 'Fail',
      uptime: f.score,
      score: f.score,
      gap: f.gap,
      description: f.description
    })),
    employees: []
  };
};

// Calculate module statistics from findings
const calculateModuleStats = (findings, modulePercentage) => {
  const passed = findings.filter(f => f.score >= 90).length;
  const partial = findings.filter(f => f.score >= 70 && f.score < 90).length;
  const failed = findings.filter(f => f.score < 70).length;
  return { passed, partial, failed };
};

// Parse gap report string into structured findings
const parseGapReport = (gapReport) => {
  if (!gapReport) return [];

  const findings = [];
  // Split by control ID pattern [X-N.N]
  const lines = gapReport.split(/\r?\n/).filter(line => line.trim());

  for (const line of lines) {
    const match = line.match(/\[([A-B]-\d+\.\d+)\]\s*Gap:\s*([\d.]+)\s*\|\s*Score:\s*(\d+)%\s*\|\s*(.*)/);
    if (match) {
      findings.push({
        controlId: match[1],
        controlName: `Control ${match[1]}`,
        gap: parseFloat(match[2]),
        score: parseInt(match[3]),
        description: match[4].trim(),
        status: parseInt(match[3]) >= 90 ? 0 : parseInt(match[3]) >= 70 ? 1 : 2
      });
    }
  }

  // Sort by gap (highest first)
  return findings.sort((a, b) => b.gap - a.gap);
};

// Parse recommendations string into array
const parseRecommendations = (recommendations) => {
  if (!recommendations) return [];

  const result = [];
  // Split by control ID pattern [X-N.N]:
  const sections = recommendations.split(/\[([A-B]-\d+\.\d+)\]:/);

  for (let i = 1; i < sections.length; i += 2) {
    const controlId = sections[i];
    const content = sections[i + 1];
    if (content) {
      // Extract individual recommendations (lines starting with -)
      const items = content.split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.startsWith('-'))
        .map(line => line.substring(1).trim());

      result.push({
        controlId,
        items
      });
    }
  }

  return result;
};

// Parse executive summary to extract strengths and gaps
const parseExecutiveSummary = (summary) => {
  const strengths = [];
  const gaps = [];

  if (!summary) return { strengths, gaps };

  // Extract strengths section
  const strengthsMatch = summary.match(/### Top 3 Strengths\s*([\s\S]*?)(?=###|$)/);
  if (strengthsMatch) {
    const strengthLines = strengthsMatch[1].split(/\r?\n/)
      .filter(line => line.match(/^\d+\./))
      .map(line => line.replace(/^\d+\.\s*\*\*/, '').replace(/\*\*.*/, '').trim());
    strengths.push(...strengthLines);
  }

  // Extract gaps section
  const gapsMatch = summary.match(/### Top 3 Critical Gaps\s*([\s\S]*?)(?=###|$)/);
  if (gapsMatch) {
    const gapLines = gapsMatch[1].split(/\r?\n/)
      .filter(line => line.match(/^\d+\./))
      .map(line => line.replace(/^\d+\.\s*\*\*/, '').replace(/\*\*.*/, '').trim());
    gaps.push(...gapLines);
  }

  return { strengths, gaps };
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
