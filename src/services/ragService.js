// Azure RAG Service for AI Verification Agent
// Uses Azure AI Search for document retrieval and Azure OpenAI for response generation
// Note: Direct browser calls - ensure CORS is configured on Azure AI Search

// RAG Configuration - Uses environment variables
const RAG_CONFIG = {
  // Azure AI Search
  searchEndpoint: process.env.REACT_APP_AZURE_SEARCH_ENDPOINT || '',
  searchKey: process.env.REACT_APP_AZURE_SEARCH_KEY || '',
  searchIndex: process.env.REACT_APP_AZURE_SEARCH_INDEX || 'audit-evidence-index',

  // Azure OpenAI
  openaiEndpoint: process.env.REACT_APP_AZURE_OPENAI_ENDPOINT || '',
  openaiKey: process.env.REACT_APP_AZURE_OPENAI_KEY || '',
  openaiDeployment: process.env.REACT_APP_AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
  openaiApiVersion: process.env.REACT_APP_AZURE_OPENAI_API_VERSION || '2024-02-15-preview'
};

/**
 * Check if RAG service is properly configured
 * @returns {object} - Configuration status
 */
export const checkRAGConfiguration = () => {
  const config = {
    searchConfigured: !!RAG_CONFIG.searchEndpoint && !!RAG_CONFIG.searchKey,
    openaiConfigured: !!RAG_CONFIG.openaiEndpoint && !!RAG_CONFIG.openaiKey,
    searchEndpoint: RAG_CONFIG.searchEndpoint,
    searchIndex: RAG_CONFIG.searchIndex,
    openaiDeployment: RAG_CONFIG.openaiDeployment,
    isReady: !!RAG_CONFIG.searchKey && !!RAG_CONFIG.openaiKey
  };

  // Debug logging
  console.log('RAG Configuration Check:', {
    searchEndpoint: RAG_CONFIG.searchEndpoint ? 'SET' : 'NOT SET',
    searchKey: RAG_CONFIG.searchKey ? 'SET (hidden)' : 'NOT SET',
    searchIndex: RAG_CONFIG.searchIndex,
    openaiEndpoint: RAG_CONFIG.openaiEndpoint ? 'SET' : 'NOT SET',
    openaiKey: RAG_CONFIG.openaiKey ? 'SET (hidden)' : 'NOT SET',
    openaiDeployment: RAG_CONFIG.openaiDeployment,
    isReady: config.isReady
  });

  return config;
};

/**
 * Search Azure AI Search for relevant audit evidence documents
 * @param {string} query - User's search query
 * @param {object} auditContext - Current audit context for filtering
 * @param {number} topK - Number of results to return (default: 5)
 * @returns {Promise<Array>} - Array of relevant document chunks
 */
export const searchAuditEvidence = async (query, auditContext = null, topK = 5) => {
  if (!RAG_CONFIG.searchEndpoint || !RAG_CONFIG.searchKey) {
    console.warn('Azure AI Search not configured');
    return [];
  }

  try {
    const searchUrl = `${RAG_CONFIG.searchEndpoint}/indexes/${RAG_CONFIG.searchIndex}/docs/search?api-version=2023-11-01`;

    // Build search request - don't specify select to return all fields
    const searchBody = {
      search: query,
      queryType: 'simple',  // Use simple search for broader compatibility
      top: topK
      // Note: Not using select parameter - will return all fields from index
    };

    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': RAG_CONFIG.searchKey
      },
      body: JSON.stringify(searchBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure AI Search error:', response.status, errorText);

      // If semantic search fails, try simple search
      if (response.status === 400) {
        return await fallbackSimpleSearch(query, auditContext, topK);
      }

      throw new Error(`Search failed: ${response.status}`);
    }

    const data = await response.json();
    const results = data.value || [];

    // Debug: Log the actual document structure
    if (results.length > 0) {
      console.log('RAG DEBUG: First document fields:', Object.keys(results[0]));
      console.log('RAG DEBUG: First document sample:', JSON.stringify(results[0]).substring(0, 500));
    }

    return results;
  } catch (error) {
    console.error('Error searching audit evidence:', error);
    throw error;
  }
};

/**
 * Fallback to simple keyword search if semantic search is not configured
 */
const fallbackSimpleSearch = async (query, auditContext, topK) => {
  const searchUrl = `${RAG_CONFIG.searchEndpoint}/indexes/${RAG_CONFIG.searchIndex}/docs/search?api-version=2023-11-01`;

  const searchBody = {
    search: query,
    queryType: 'simple',
    top: topK
    // Note: Not using select parameter - will return all fields from index
  };

  const response = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': RAG_CONFIG.searchKey
    },
    body: JSON.stringify(searchBody)
  });

  if (!response.ok) {
    throw new Error(`Fallback search failed: ${response.status}`);
  }

  const data = await response.json();
  return data.value || [];
};

/**
 * Generate RAG response using Azure OpenAI with retrieved context
 * @param {string} userPrompt - User's question
 * @param {Array} retrievedDocs - Documents retrieved from search
 * @param {object} auditContext - Current audit data for additional context
 * @returns {Promise<object>} - Generated response with sources
 */
export const generateRAGResponse = async (userPrompt, retrievedDocs, auditContext = null) => {
  if (!RAG_CONFIG.openaiEndpoint || !RAG_CONFIG.openaiKey) {
    console.warn('Azure OpenAI not configured');
    return {
      content: 'Azure OpenAI is not configured. Please set the environment variables.',
      sources: [],
      error: true
    };
  }

  try {
    // Build OpenAI URL - handle both full URL and base endpoint formats
    let openaiUrl;
    if (RAG_CONFIG.openaiEndpoint.includes('/openai/deployments/')) {
      // User provided full URL - use as-is (remove any trailing parts after the base)
      const baseEndpoint = RAG_CONFIG.openaiEndpoint.split('/openai/deployments/')[0];
      openaiUrl = `${baseEndpoint}/openai/deployments/${RAG_CONFIG.openaiDeployment}/chat/completions?api-version=${RAG_CONFIG.openaiApiVersion}`;
    } else {
      // User provided base endpoint
      openaiUrl = `${RAG_CONFIG.openaiEndpoint}/openai/deployments/${RAG_CONFIG.openaiDeployment}/chat/completions?api-version=${RAG_CONFIG.openaiApiVersion}`;
    }

    // Build context from retrieved documents
    // Using your index fields: document_title, content_text
    const MAX_DOC_LENGTH = 2000;
    const contextText = retrievedDocs.length > 0
      ? retrievedDocs.slice(0, 3).map((doc, idx) => {
          // Use your index field names
          const docName = doc.document_title || doc.documentName || doc.title || `Document ${idx + 1}`;
          // Use content_text field from your index
          let docContent = doc.content_text || doc.content || doc.text || '';
          // Truncate if too long
          if (docContent.length > MAX_DOC_LENGTH) {
            docContent = docContent.substring(0, MAX_DOC_LENGTH) + '... [truncated]';
          }
          return `[Source ${idx + 1}: ${docName}]\n${docContent}`;
        }).join('\n\n---\n\n')
      : 'No relevant documents found in the search index.';

    console.log('RAG: Context length (chars):', contextText.length);

    // Log retrieved docs structure for debugging
    if (retrievedDocs.length > 0) {
      console.log('RAG: Retrieved document fields:', Object.keys(retrievedDocs[0]));
    }

    // Build audit context summary if available
    const auditSummary = auditContext ? `
Current Audit Context:
- Audit ID: ${auditContext.auditId || auditContext.id || 'N/A'}
- Partner: ${auditContext.partner || auditContext.clientName || 'N/A'}
- Overall Score: ${auditContext.overallScore || auditContext.complianceScore || 'N/A'}%
- Specialization: ${auditContext.name || auditContext.moduleBScore?.moduleName || 'N/A'}
- Status: ${auditContext.status || 'N/A'}
` : '';

    const systemPrompt = `You are the Foundry IQ Agent, an AI audit verification assistant for Azure specialization audits.
Your role is to analyze audit evidence documents and provide accurate, evidence-based responses to auditor queries.

Guidelines:
1. Only use information from the provided evidence documents
2. Cite specific sources when making claims (use [Source N] format)
3. If information is not in the provided context, clearly state that
4. Be precise about compliance scores, dates, and certification details
5. Highlight any discrepancies or gaps in evidence
6. Use professional audit terminology
7. Be concise but thorough

${auditSummary}

Retrieved Evidence Documents:
${contextText}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await fetch(openaiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': RAG_CONFIG.openaiKey
      },
      body: JSON.stringify({
        messages,
        max_tokens: 800,  // Reduced to prevent rate limiting
        temperature: 0.3,
        top_p: 0.95
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure OpenAI error:', response.status, errorText);
      throw new Error(`OpenAI request failed: ${response.status}`);
    }

    const data = await response.json();
    const generatedContent = data.choices?.[0]?.message?.content || 'No response generated.';

    return {
      content: generatedContent,
      sources: retrievedDocs.map((doc, idx) => ({
        // Use your Azure AI Search index field names
        documentName: doc.document_title || doc.documentName || doc.title || `Document ${idx + 1}`,
        documentId: doc.image_document_id || doc.id || null,
        relevanceScore: doc['@search.score'],
        // Include content preview for tooltip
        contentPreview: (doc.content_text || '').substring(0, 150) + '...',
        // Source number for citation reference
        sourceNumber: idx + 1
      })),
      usage: data.usage,
      error: false
    };
  } catch (error) {
    console.error('Error generating RAG response:', error);
    throw error;
  }
};

/**
 * Main RAG query function - orchestrates search and generation
 * @param {string} userPrompt - User's question
 * @param {object} auditContext - Current audit context
 * @returns {Promise<object>} - Complete RAG response
 */
export const queryRAG = async (userPrompt, auditContext = null) => {
  const startTime = Date.now();

  try {
    // Step 1: Retrieve relevant documents from Azure AI Search
    console.log('RAG: Searching for relevant documents...');
    const retrievedDocs = await searchAuditEvidence(userPrompt, auditContext, 3);  // Reduced to 3 docs
    console.log(`RAG: Found ${retrievedDocs.length} relevant documents`);

    // Step 2: Generate response with Azure OpenAI using retrieved context
    console.log('RAG: Generating response with GPT-4o...');
    const response = await generateRAGResponse(userPrompt, retrievedDocs, auditContext);

    return {
      ...response,
      retrievalCount: retrievedDocs.length,
      processingTimeMs: Date.now() - startTime
    };
  } catch (error) {
    console.error('RAG query failed:', error);
    return {
      content: `Error processing query: ${error.message}`,
      sources: [],
      error: true,
      errorMessage: error.message,
      processingTimeMs: Date.now() - startTime
    };
  }
};

// Export configuration for debugging
export { RAG_CONFIG };

const ragService = {
  RAG_CONFIG,
  checkRAGConfiguration,
  searchAuditEvidence,
  generateRAGResponse,
  queryRAG
};

export default ragService;
