import React, { useState, useReducer, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import { transformAuditDocument, getSampleCosmosAudit, fetchAuditsFromCosmosDB } from './services/cosmosDbService';
// ==================== REDUX-LIKE STATE MANAGEMENT ====================
const initialState = {
  currentPersona: 'auditor',
  selectedAudit: null,
  promptHistory: [],
  agentResponses: [],
  filterStatus: 'all',
  cosmosAudits: [], // Populated from Cosmos DB
  cosmosLoading: true, // Loading state for Cosmos DB fetch
  cosmosError: null, // Error state for Cosmos DB fetch
  audits: [], // Legacy - kept for compatibility
  
  // Workflow Templates for Platform Engineer
  workflowTemplates: [
    {
      id: 'WF-001',
      name: 'Azure AI Platform Specialization',
      requiredModules: ['AI-102', 'AI-900', 'DP-100'],
      workloadCriteria: 'Minimum 3 AI/ML workloads, 12 months runtime',
      certificationReq: 'At least 2 employees with AI-102, DP-100, or AI-900',
      auditFrequency: 'Quarterly',
      verificationPeriod: 'Rolling 12-month window'
    },
    {
      id: 'WF-002',
      name: 'Azure Data & Analytics Specialization',
      requiredModules: ['DP-203', 'DP-900'],
      workloadCriteria: '3+ data platform workloads (Synapse, Data Factory, Databricks) for 12 months',
      certificationReq: 'Minimum 2 employees with DP-203, DP-900, or DP-100',
      auditFrequency: 'Quarterly with annual comprehensive audit',
      verificationPeriod: 'Rolling 12-month window'
    }
  ],
  
  // Sample Prompts for Auditors
  samplePrompts: {
    'AI/ML Specialization': [
      'List 2 customer workloads with 12-month runtime requirement',
      'Show employee skills and certification dates',
      'Cross-reference computed evidence score',
      'How was workload compliance calculated?'
    ],
    'Data & Analytics': [
      'Display 3+ data platform workloads with metrics',
      'Verify DP-203/DP-900/DP-100 certifications',
      'Show pipeline SLA compliance data',
      'Calculate score methodology breakdown'
    ],
    'Security': [
      'Challenge compliance score for AZ-500',
      'Show security workload timestamps',
      'List employees with expired certifications',
      'Recalculate score showing methodology'
    ],
    'General': [
      'Explain discrepancies in scoring logic',
      'Show mapping between employees and certs',
      'Validate continuous 12+ month runtime',
      'Cross-check Microsoft Learn transcripts'
    ]
  },
  
  // Dashboard Stats
  stats: {
    auditsLast30Days: 127,
    pendingReview: 23,
    approved: 89,
    rejected: 15,
    avgComplianceScore: 84.2,
    activeAgents: 8
  }
};

// Action Types
const ACTIONS = {
  SET_PERSONA: 'SET_PERSONA',
  SET_FILTER: 'SET_FILTER',
  SELECT_AUDIT: 'SELECT_AUDIT',
  ADD_PROMPT: 'ADD_PROMPT',
  ADD_AGENT_RESPONSE: 'ADD_AGENT_RESPONSE',
  UPDATE_AUDIT_STATUS: 'UPDATE_AUDIT_STATUS',
  CREATE_WORKFLOW: 'CREATE_WORKFLOW',
  DEPLOY_AGENTS: 'DEPLOY_AGENTS',
  CLEAR_PROMPTS: 'CLEAR_PROMPTS',
  SET_COSMOS_AUDITS: 'SET_COSMOS_AUDITS',
  SET_COSMOS_LOADING: 'SET_COSMOS_LOADING',
  SET_COSMOS_ERROR: 'SET_COSMOS_ERROR'
};

// Reducer
function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_PERSONA:
      return { ...state, currentPersona: action.payload, selectedAudit: null };
    case ACTIONS.SET_FILTER:
      return { ...state, filterStatus: action.payload };
    case ACTIONS.SELECT_AUDIT:
      return { ...state, selectedAudit: action.payload };
    case ACTIONS.ADD_PROMPT:
      return { ...state, promptHistory: [...state.promptHistory, action.payload] };
    case ACTIONS.ADD_AGENT_RESPONSE:
      return { ...state, agentResponses: [...state.agentResponses, action.payload] };
    case ACTIONS.UPDATE_AUDIT_STATUS:
      return {
        ...state,
        cosmosAudits: state.cosmosAudits.map(a =>
          a.id === action.payload.id ? { ...a, status: action.payload.status } : a
        )
      };
    case ACTIONS.CREATE_WORKFLOW:
      return {
        ...state,
        workflowTemplates: [...state.workflowTemplates, action.payload]
      };
    case ACTIONS.CLEAR_PROMPTS:
      return { ...state, promptHistory: [], agentResponses: [] };
    case ACTIONS.SET_COSMOS_AUDITS:
      return { ...state, cosmosAudits: action.payload, cosmosLoading: false, cosmosError: null };
    case ACTIONS.SET_COSMOS_LOADING:
      return { ...state, cosmosLoading: action.payload };
    case ACTIONS.SET_COSMOS_ERROR:
      return { ...state, cosmosError: action.payload, cosmosLoading: false };
    default:
      return state;
  }
}

// ==================== STYLED COMPONENTS ====================
const styles = {
  app: {
    fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
    color: '#1e293b'
  },
  header: {
    background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
    padding: '16px 32px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  logoText: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#fff',
    letterSpacing: '-0.5px'
  },
  logoAccent: {
    color: '#f97316'
  },
  personaSwitch: {
    display: 'flex',
    gap: '8px',
    background: 'rgba(255,255,255,0.1)',
    padding: '4px',
    borderRadius: '12px'
  },
  personaBtn: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
    transition: 'all 0.3s ease'
  },
  personaBtnActive: {
    background: '#fff',
    color: '#1e3a5f'
  },
  personaBtnInactive: {
    background: 'transparent',
    color: 'rgba(255,255,255,0.7)'
  },
  mainContainer: {
    display: 'grid',
    gridTemplateColumns: '400px 1fr 360px',
    gap: '20px',
    padding: '20px',
    maxWidth: '1800px',
    margin: '0 auto'
  },
  card: {
    background: '#fff',
    borderRadius: '16px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    overflow: 'hidden'
  },
  cardHeader: {
    padding: '20px 24px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1e293b',
    margin: 0
  },
  cardSubtitle: {
    fontSize: '13px',
    color: '#64748b',
    marginTop: '4px'
  },
  cardBody: {
    padding: '20px 24px'
  },
  statsGrid: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
    flexWrap: 'wrap'
  },
  statCard: {
    flex: '1',
    minWidth: '140px',
    padding: '12px 16px',
    borderRadius: '10px',
    textAlign: 'center'
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '800',
    marginBottom: '2px'
  },
  statLabel: {
    fontSize: '10px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  filterTabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px',
    flexWrap: 'wrap'
  },
  filterTab: {
    padding: '8px 16px',
    border: '2px solid #e2e8f0',
    borderRadius: '20px',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    transition: 'all 0.2s ease'
  },
  filterTabActive: {
    background: '#1e3a5f',
    borderColor: '#1e3a5f',
    color: '#fff'
  },
  auditItem: {
    padding: '16px',
    borderRadius: '12px',
    border: '2px solid #e2e8f0',
    marginBottom: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  auditItemSelected: {
    borderColor: '#3b82f6',
    background: '#eff6ff'
  },
  auditName: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: '8px'
  },
  auditMeta: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    fontSize: '12px',
    color: '#64748b',
    marginBottom: '10px'
  },
  badge: {
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  certBadge: {
    background: '#dbeafe',
    color: '#1d4ed8',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
    marginRight: '6px'
  },
  scoreCircle: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: '800',
    marginLeft: 'auto'
  },
  promptSurface: {
    background: '#f8fafc',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '16px'
  },
  promptInput: {
    width: '100%',
    padding: '14px 16px',
    border: '2px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '14px',
    resize: 'none',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 0.2s ease'
  },
  promptBtn: {
    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    color: '#fff',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '10px',
    fontWeight: '700',
    cursor: 'pointer',
    fontSize: '14px',
    marginTop: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease'
  },
  samplePromptCard: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#475569',
    transition: 'all 0.2s ease'
  },
  agentResponse: {
    background: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px'
  },
  responseHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    fontSize: '13px',
    fontWeight: '700',
    color: '#166534'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px'
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    background: '#f1f5f9',
    fontWeight: '700',
    color: '#475569',
    borderBottom: '2px solid #e2e8f0'
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid #e2e8f0'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#374151'
  },
  input: {
    padding: '12px 14px',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s ease'
  },
  select: {
    padding: '12px 14px',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    background: '#fff',
    cursor: 'pointer'
  },
  configBox: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '16px',
    marginTop: '12px'
  },
  configTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#475569',
    marginBottom: '12px'
  },
  actionBtns: {
    display: 'flex',
    gap: '12px',
    marginTop: '20px'
  },
  btnPrimary: {
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#fff',
    border: 'none',
    padding: '14px 28px',
    borderRadius: '10px',
    fontWeight: '700',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  btnSecondary: {
    background: '#64748b',
    color: '#fff',
    border: 'none',
    padding: '14px 28px',
    borderRadius: '10px',
    fontWeight: '700',
    cursor: 'pointer',
    fontSize: '14px'
  },
  evidencePanel: {
    maxHeight: '400px',
    overflowY: 'auto'
  }
};

// Status colors and labels
const statusConfig = {
  pending_review: { bg: '#fef3c7', color: '#92400e', label: 'Pending Review' },
  approved: { bg: '#dcfce7', color: '#166534', label: 'Approved' },
  rejected: { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
  in_progress: { bg: '#dbeafe', color: '#1e40af', label: 'In Progress' }
};

// Score color
const getScoreColor = (score) => {
  if (score >= 90) return { bg: '#dcfce7', color: '#166534' };
  if (score >= 80) return { bg: '#dbeafe', color: '#1e40af' };
  if (score >= 70) return { bg: '#fef3c7', color: '#92400e' };
  return { bg: '#fee2e2', color: '#991b1b' };
};

// ==================== COMPONENTS ====================

// Header Component
const Header = ({ state, dispatch }) => (
  <header style={styles.header}>
    <div style={styles.logo}>
      <div>
        <div style={styles.logoText}>
          audit<span style={styles.logoAccent}>X</span>
        </div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', letterSpacing: '2px' }}>
          AZURE SPECIALIZATION AUDIT PLATFORM
        </div>
      </div>
    </div>
    
    <div style={styles.personaSwitch}>
      <button
        style={{
          ...styles.personaBtn,
          ...(state.currentPersona === 'auditor' ? styles.personaBtnActive : styles.personaBtnInactive)
        }}
        onClick={() => dispatch({ type: ACTIONS.SET_PERSONA, payload: 'auditor' })}
      >
        🔍 Auditor Workbench
      </button>
      <button
        style={{
          ...styles.personaBtn,
          ...(state.currentPersona === 'engineer' ? styles.personaBtnActive : styles.personaBtnInactive)
        }}
        onClick={() => dispatch({ type: ACTIONS.SET_PERSONA, payload: 'engineer' })}
      >
        ⚙️ Platform Engineer
      </button>
      <button
        style={{
          ...styles.personaBtn,
          ...(state.currentPersona === 'partner' ? styles.personaBtnActive : styles.personaBtnInactive)
        }}
        onClick={() => dispatch({ type: ACTIONS.SET_PERSONA, payload: 'partner' })}
      >
        🏢 Partner Portal
      </button>
    </div>
    
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ 
        background: 'rgba(34, 197, 94, 0.2)', 
        padding: '8px 16px', 
        borderRadius: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <span style={{ width: '8px', height: '8px', background: '#22c55e', borderRadius: '50%' }}></span>
        <span style={{ color: '#86efac', fontSize: '13px', fontWeight: '600' }}>
          {state.stats.activeAgents} Agents Active
        </span>
      </div>
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: '700',
        fontSize: '16px'
      }}>
        PS
      </div>
    </div>
  </header>
);

// Stats Dashboard Component
const StatsDashboard = ({ stats, cosmosAudits }) => {
  // Calculate dynamic stats from Cosmos DB data
  const dynamicStats = {
    total: cosmosAudits?.length || 0,
    pendingReview: cosmosAudits?.filter(a => a.status === 'pending_review').length || 0,
    approved: cosmosAudits?.filter(a => a.status === 'approved').length || 0,
    rejected: cosmosAudits?.filter(a => a.status === 'rejected').length || 0,
    avgScore: cosmosAudits?.length > 0
      ? Math.round(cosmosAudits.reduce((sum, a) => sum + (a.complianceScore || a.overallScore || 0), 0) / cosmosAudits.length)
      : 0
  };

  return (
    <div style={styles.statsGrid}>
      <div style={{ ...styles.statCard, background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' }}>
        <div style={{ ...styles.statValue, color: '#1d4ed8' }}>{dynamicStats.total}</div>
        <div style={{ ...styles.statLabel, color: '#3b82f6' }}>Total Audits</div>
      </div>
      <div style={{ ...styles.statCard, background: 'linear-gradient(135deg, #fefce8 0%, #fef3c7 100%)' }}>
        <div style={{ ...styles.statValue, color: '#a16207' }}>{dynamicStats.pendingReview}</div>
        <div style={{ ...styles.statLabel, color: '#ca8a04' }}>Pending Review</div>
      </div>
      <div style={{ ...styles.statCard, background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' }}>
        <div style={{ ...styles.statValue, color: '#166534' }}>{dynamicStats.approved}</div>
        <div style={{ ...styles.statLabel, color: '#22c55e' }}>Approved</div>
      </div>
      <div style={{ ...styles.statCard, background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)' }}>
        <div style={{ ...styles.statValue, color: '#991b1b' }}>{dynamicStats.rejected}</div>
        <div style={{ ...styles.statLabel, color: '#ef4444' }}>Rejected</div>
      </div>
      <div style={{ ...styles.statCard, background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)' }}>
        <div style={{ ...styles.statValue, color: '#6d28d9' }}>{dynamicStats.avgScore}%</div>
        <div style={{ ...styles.statLabel, color: '#8b5cf6' }}>Avg Score</div>
      </div>
    </div>
  );
};

// Audit Queue Component
const AuditQueue = ({ filterStatus, selectedAudit, dispatch, cosmosAudits, cosmosLoading, cosmosError }) => {
  const filters = [
    { key: 'all', label: 'All' },
    { key: 'pending_review', label: 'Pending Review' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'in_progress', label: 'In Progress' }
  ];

  const filteredAudits = filterStatus === 'all'
    ? cosmosAudits
    : cosmosAudits.filter(a => a.status === filterStatus);

  return (
    <div>
      {/* Data Source Info */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '16px',
        padding: '12px',
        background: '#eff6ff',
        borderRadius: '10px',
        border: '2px solid #3b82f6',
        flexWrap: 'wrap'
      }}>
        <span style={{
          padding: '6px 16px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '700',
          background: '#3b82f6',
          color: '#fff'
        }}>
          Azure Cosmos DB
        </span>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
          {filteredAudits.length} audit(s)
        </span>
        {cosmosLoading && (
          <span style={{
            fontSize: '11px',
            color: '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            Loading from Cosmos DB...
          </span>
        )}
        {cosmosError && (
          <span style={{
            fontSize: '11px',
            color: '#dc2626',
            background: '#fee2e2',
            padding: '4px 8px',
            borderRadius: '4px'
          }}>
            Connection issue - check Azure configuration
          </span>
        )}
      </div>

      <div style={styles.filterTabs}>
        {filters.map(f => (
          <button
            key={f.key}
            style={{
              ...styles.filterTab,
              ...(filterStatus === f.key ? styles.filterTabActive : {})
            }}
            onClick={() => dispatch({ type: ACTIONS.SET_FILTER, payload: f.key })}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
        {filteredAudits.length === 0 ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: '#94a3b8'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📋</div>
            <div>No audits found</div>
          </div>
        ) : filteredAudits.map(audit => {
          const status = statusConfig[audit.status] || statusConfig.pending_review;
          const scoreColor = getScoreColor(audit.complianceScore || audit.overallScore);
          const isSelected = selectedAudit?.id === audit.id;
          const score = audit.complianceScore || audit.overallScore || 0;

          return (
            <div
              key={audit.id}
              style={{
                ...styles.auditItem,
                ...(isSelected ? styles.auditItemSelected : {})
              }}
              onClick={() => dispatch({ type: ACTIONS.SELECT_AUDIT, payload: audit })}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  {/* Audit Name */}
                  <div style={styles.auditName}>{audit.name}</div>

                  {/* Client/Partner Name - Prominent Display */}
                  <div style={{
                    fontSize: '13px',
                    color: '#1e3a5f',
                    fontWeight: '600',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    🏢 {audit.partner || audit.clientName || 'Unknown Client'}
                  </div>

                  {/* Status Badges */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      ...styles.badge,
                      background: status.bg,
                      color: status.color
                    }}>
                      {status.label}
                    </span>
                    {audit.type && (
                      <span style={{
                        ...styles.badge,
                        background: '#f1f5f9',
                        color: '#475569'
                      }}>
                        {audit.type}
                      </span>
                    )}
                  </div>

                  {/* Key Dates - SLA/Expiry Prominent */}
                  <div style={{
                    ...styles.auditMeta,
                    background: '#fef3c7',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    marginBottom: '8px'
                  }}>
                    <span style={{ fontWeight: '600', color: '#92400e' }}>
                      ⏰ SLA: {audit.slaDate || 'N/A'}
                    </span>
                    <span>📅 Due: {audit.dueDate || 'N/A'}</span>
                  </div>

                  {/* Evidence & Workload Count */}
                  <div style={styles.auditMeta}>
                    <span>📋 {audit.evidenceItems || 0} evidence</span>
                    <span>💼 {audit.workloads || 0} controls</span>
                  </div>

                  {/* Certifications */}
                  {audit.certifications && audit.certifications.length > 0 && (
                    <div>
                      {audit.certifications.map(cert => (
                        <span key={cert} style={styles.certBadge}>{cert}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Overall Score Circle */}
                <div style={{
                  ...styles.scoreCircle,
                  background: scoreColor.bg,
                  color: scoreColor.color,
                  flexDirection: 'column',
                  width: '70px',
                  height: '70px'
                }}>
                  <div style={{ fontSize: '20px', fontWeight: '800' }}>{score}%</div>
                  <div style={{ fontSize: '9px', fontWeight: '600', opacity: 0.8 }}>SCORE</div>
                </div>
              </div>

              {/* Assigned To */}
              {audit.assignedTo && (
                <div style={{
                  marginTop: '10px',
                  fontSize: '12px',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  👤 Assigned to: <strong>{audit.assignedTo}</strong>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Sample Prompts Panel
const SamplePromptsPanel = ({ samplePrompts, onPromptSelect }) => (
  <div>
    {Object.entries(samplePrompts).map(([category, prompts]) => (
      <div key={category} style={{ marginBottom: '20px' }}>
        <div style={{ 
          fontSize: '13px', 
          fontWeight: '700', 
          color: '#1e3a5f',
          marginBottom: '10px',
          padding: '8px 12px',
          background: '#f1f5f9',
          borderRadius: '6px'
        }}>
          {category}
        </div>
        {prompts.map((prompt, idx) => (
          <div
            key={idx}
            style={styles.samplePromptCard}
            onClick={() => onPromptSelect(prompt)}
          >
            💬 {prompt}
          </div>
        ))}
      </div>
    ))}
  </div>
);

// Evidence Viewer Component with Tabs - Enhanced for Cosmos DB data
const EvidenceViewer = ({ audit, onUploadComplete }) => {
  const [activeTab, setActiveTab] = useState('scores');

  const tabStyles = {
    tabContainer: {
      display: 'flex',
      gap: '4px',
      marginBottom: '20px',
      borderBottom: '2px solid #e2e8f0',
      paddingBottom: '0',
      flexWrap: 'wrap'
    },
    tab: {
      padding: '12px 16px',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: '600',
      color: '#64748b',
      borderBottom: '2px solid transparent',
      marginBottom: '-2px',
      transition: 'all 0.2s ease'
    },
    tabActive: {
      color: '#3b82f6',
      borderBottomColor: '#3b82f6'
    }
  };

  // Get status color for control scores
  const getControlStatusColor = (status) => {
    switch (status) {
      case 0: return { bg: '#dcfce7', color: '#166534', label: 'Pass' };
      case 1: return { bg: '#fef3c7', color: '#92400e', label: 'Partial' };
      case 2: return { bg: '#fee2e2', color: '#991b1b', label: 'Fail' };
      default: return { bg: '#f1f5f9', color: '#64748b', label: 'Unknown' };
    }
  };

  if (!audit) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        color: '#94a3b8'
      }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <div style={{ marginTop: '16px', fontWeight: '600' }}>Select an audit to view evidence</div>
      </div>
    );
  }

  // Check if this is Cosmos DB data (has moduleAScore)
  const isCosmosData = audit.moduleAScore || audit.moduleBScore;

  return (
    <div>
      {/* Tabs */}
      <div style={tabStyles.tabContainer}>
        <button
          style={{
            ...tabStyles.tab,
            ...(activeTab === 'scores' ? tabStyles.tabActive : {})
          }}
          onClick={() => setActiveTab('scores')}
        >
          📊 Module Scores
        </button>
        <button
          style={{
            ...tabStyles.tab,
            ...(activeTab === 'findings' ? tabStyles.tabActive : {})
          }}
          onClick={() => setActiveTab('findings')}
        >
          🔍 Findings
        </button>
        <button
          style={{
            ...tabStyles.tab,
            ...(activeTab === 'recommendations' ? tabStyles.tabActive : {})
          }}
          onClick={() => setActiveTab('recommendations')}
        >
          💡 Recommendations
        </button>
        <button
          style={{
            ...tabStyles.tab,
            ...(activeTab === 'upload' ? tabStyles.tabActive : {})
          }}
          onClick={() => setActiveTab('upload')}
        >
          ☁️ Upload
        </button>
      </div>

      {/* Module Scores Tab */}
      {activeTab === 'scores' && (
        <div style={{ ...styles.evidencePanel, maxHeight: '500px' }}>
          {/* Overall Score Summary */}
          <div style={{
            background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px',
            color: '#fff'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', opacity: 0.8, marginBottom: '4px' }}>Overall Audit Score</div>
                <div style={{ fontSize: '36px', fontWeight: '800' }}>
                  {audit.overallScore || audit.complianceScore || 0}%
                </div>
                <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '4px' }}>
                  {audit.executiveSummary?.includes('FAIL') ? '❌ FAIL' : audit.executiveSummary?.includes('PASS') ? '✅ PASS' : '⏳ Pending'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', opacity: 0.7 }}>Checklist Version</div>
                <div style={{ fontSize: '16px', fontWeight: '600' }}>{audit.checklistVersion || 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Module A Score */}
          {audit.moduleAScore && (
            <div style={{
              background: '#fff',
              border: '2px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
                    Module A: {audit.moduleAScore.moduleName}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {audit.moduleAScore.passedControls} Passed | {audit.moduleAScore.partialControls} Partial | {audit.moduleAScore.failedControls} Failed
                  </div>
                </div>
                <div style={{
                  background: getScoreColor(audit.moduleAScore.score).bg,
                  color: getScoreColor(audit.moduleAScore.score).color,
                  padding: '12px 20px',
                  borderRadius: '10px',
                  fontWeight: '800',
                  fontSize: '20px'
                }}>
                  {Math.round(audit.moduleAScore.score)}%
                </div>
              </div>

              {/* Control Scores Table */}
              <table style={{ ...styles.table, fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={styles.th}>Control ID</th>
                    <th style={styles.th}>Control Name</th>
                    <th style={styles.th}>Score</th>
                    <th style={styles.th}>Weight</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.moduleAScore.controlScores?.map((control, idx) => {
                    const statusStyle = getControlStatusColor(control.status);
                    return (
                      <tr key={idx}>
                        <td style={styles.td}><strong>{control.controlId}</strong></td>
                        <td style={styles.td}>{control.controlName}</td>
                        <td style={styles.td}>{control.score}%</td>
                        <td style={styles.td}>{control.weight}</td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.badge,
                            background: statusStyle.bg,
                            color: statusStyle.color
                          }}>{statusStyle.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Module B Score */}
          {audit.moduleBScore && (
            <div style={{
              background: '#fff',
              border: '2px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>
                    Module B: {audit.moduleBScore.moduleName}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {audit.moduleBScore.passedControls} Passed | {audit.moduleBScore.partialControls} Partial | {audit.moduleBScore.failedControls} Failed
                  </div>
                </div>
                <div style={{
                  background: getScoreColor(audit.moduleBScore.score).bg,
                  color: getScoreColor(audit.moduleBScore.score).color,
                  padding: '12px 20px',
                  borderRadius: '10px',
                  fontWeight: '800',
                  fontSize: '20px'
                }}>
                  {Math.round(audit.moduleBScore.score)}%
                </div>
              </div>

              {/* Control Scores Table */}
              <table style={{ ...styles.table, fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={styles.th}>Control ID</th>
                    <th style={styles.th}>Control Name</th>
                    <th style={styles.th}>Score</th>
                    <th style={styles.th}>Weight</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.moduleBScore.controlScores?.map((control, idx) => {
                    const statusStyle = getControlStatusColor(control.status);
                    return (
                      <tr key={idx}>
                        <td style={styles.td}><strong>{control.controlId}</strong></td>
                        <td style={styles.td}>{control.controlName}</td>
                        <td style={styles.td}>{control.score}%</td>
                        <td style={styles.td}>{control.weight}</td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.badge,
                            background: statusStyle.bg,
                            color: statusStyle.color
                          }}>{statusStyle.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Legacy workload display for non-Cosmos data */}
          {!isCosmosData && audit.workloadDetails && (
            <div>
              <h4 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>Workload Evidence</h4>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Workload Name</th>
                    <th style={styles.th}>Start Date</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Uptime</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.workloadDetails.map((w, idx) => (
                    <tr key={idx}>
                      <td style={styles.td}>{w.name}</td>
                      <td style={styles.td}>{w.startDate}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.badge,
                          background: '#dcfce7',
                          color: '#166534'
                        }}>{w.status}</span>
                      </td>
                      <td style={styles.td}>{w.uptime}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Findings Tab */}
      {activeTab === 'findings' && (
        <div style={{ ...styles.evidencePanel, maxHeight: '500px' }}>
          {/* Key Strengths */}
          {audit.keyStrengths && audit.keyStrengths.length > 0 && (
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px'
            }}>
              <div style={{ fontWeight: '700', color: '#166534', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ✅ Key Strengths
              </div>
              {audit.keyStrengths.map((strength, idx) => (
                <div key={idx} style={{
                  padding: '8px 12px',
                  background: '#fff',
                  borderRadius: '6px',
                  marginBottom: '6px',
                  fontSize: '13px',
                  color: '#166534'
                }}>
                  {strength}
                </div>
              ))}
            </div>
          )}

          {/* Key Gaps */}
          {audit.keyGaps && audit.keyGaps.length > 0 && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px'
            }}>
              <div style={{ fontWeight: '700', color: '#991b1b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ❌ Key Gaps ({audit.keyGaps.length})
              </div>
              {audit.keyGaps.slice(0, 5).map((gap, idx) => (
                <div key={idx} style={{
                  padding: '8px 12px',
                  background: '#fff',
                  borderRadius: '6px',
                  marginBottom: '6px',
                  fontSize: '13px',
                  color: '#991b1b'
                }}>
                  • {gap}
                </div>
              ))}
              {audit.keyGaps.length > 5 && (
                <div style={{ fontSize: '12px', color: '#991b1b', marginTop: '8px' }}>
                  +{audit.keyGaps.length - 5} more gaps...
                </div>
              )}
            </div>
          )}

          {/* Detailed Findings */}
          {audit.findings && audit.findings.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>Detailed Control Findings</h4>
              {audit.findings.map((finding, idx) => {
                const statusStyle = getControlStatusColor(finding.status);
                return (
                  <div key={idx} style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '16px',
                    marginBottom: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <span style={{ fontWeight: '700', color: '#1e3a5f', marginRight: '8px' }}>{finding.controlId}</span>
                        <span style={{ color: '#475569' }}>{finding.controlName}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '700', color: '#1e293b' }}>{finding.score}%</span>
                        <span style={{
                          ...styles.badge,
                          background: statusStyle.bg,
                          color: statusStyle.color
                        }}>{statusStyle.label}</span>
                      </div>
                    </div>

                    {/* Evidence Found */}
                    {finding.evidenceFound && finding.evidenceFound.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#16a34a', marginBottom: '4px' }}>
                          ✓ Evidence Found:
                        </div>
                        <div style={{ fontSize: '12px', color: '#475569', paddingLeft: '12px' }}>
                          {finding.evidenceFound.join(' | ')}
                        </div>
                      </div>
                    )}

                    {/* Evidence Missing */}
                    {finding.evidenceMissing && finding.evidenceMissing.length > 0 && (
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#dc2626', marginBottom: '4px' }}>
                          ✗ Evidence Missing:
                        </div>
                        <div style={{ fontSize: '12px', color: '#475569', paddingLeft: '12px' }}>
                          {finding.evidenceMissing.join(' | ')}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Recommendations Tab */}
      {activeTab === 'recommendations' && (
        <div style={{ ...styles.evidencePanel, maxHeight: '500px' }}>
          <div style={{
            background: '#eff6ff',
            border: '1px solid #93c5fd',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px'
          }}>
            <div style={{ fontWeight: '700', color: '#1d4ed8', marginBottom: '4px' }}>
              💡 Recommendations Summary
            </div>
            <div style={{ fontSize: '13px', color: '#3b82f6' }}>
              {audit.recommendations?.length || 0} recommendations to improve audit compliance
            </div>
          </div>

          {audit.recommendations && audit.recommendations.length > 0 ? (
            <div>
              {audit.recommendations.map((rec, idx) => (
                <div key={idx} style={{
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '12px',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start'
                }}>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: '#dbeafe',
                    color: '#1d4ed8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '700',
                    fontSize: '12px',
                    flexShrink: 0
                  }}>
                    {idx + 1}
                  </div>
                  <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.5' }}>
                    {rec}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              No recommendations available
            </div>
          )}
        </div>
      )}

      {/* Upload Tab */}
      {activeTab === 'upload' && (
        <FileUpload
          auditId={audit.id}
          auditName={audit.name}
          onUploadComplete={onUploadComplete}
        />
      )}
    </div>
  );
};

// Agent Response Component
const AgentResponse = ({ prompt, audit }) => {
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);
  
  if (loading) {
    return (
      <div style={{ ...styles.agentResponse, background: '#f8fafc', borderColor: '#e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="spinner" style={{
            width: '20px',
            height: '20px',
            border: '3px solid #e2e8f0',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <span style={{ color: '#64748b', fontWeight: '600' }}>Foundry IQ Agent analyzing evidence...</span>
        </div>
      </div>
    );
  }
  
  // Generate mock response based on prompt
  const generateResponse = () => {
    if (prompt.toLowerCase().includes('workload') && prompt.toLowerCase().includes('12-month')) {
      return {
        title: 'Workload Runtime Analysis',
        content: audit ? (
          <div>
            <p style={{ marginBottom: '12px' }}>Found <strong>{audit.workloadDetails.length}</strong> workloads meeting the 12-month runtime requirement:</p>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Workload</th>
                  <th style={styles.th}>Runtime</th>
                  <th style={styles.th}>Uptime %</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {audit.workloadDetails.slice(0, 2).map((w, i) => {
                  const start = new Date(w.startDate);
                  const months = Math.floor((new Date() - start) / (1000 * 60 * 60 * 24 * 30));
                  return (
                    <tr key={i}>
                      <td style={styles.td}>{w.name}</td>
                      <td style={styles.td}>{months} months</td>
                      <td style={styles.td}>{w.uptime}%</td>
                      <td style={styles.td}>
                        <span style={{ color: months >= 12 ? '#16a34a' : '#dc2626' }}>
                          {months >= 12 ? '✓ Compliant' : '⚠ Below 12 months'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : 'Select an audit to view workload analysis.'
      };
    }
    
    if (prompt.toLowerCase().includes('employee') || prompt.toLowerCase().includes('certification')) {
      return {
        title: 'Employee Certification Analysis',
        content: audit ? (
          <div>
            <p style={{ marginBottom: '12px' }}>
              <strong>{audit.employees.length}</strong> certified employees found for {audit.name}:
            </p>
            {audit.employees.map((e, i) => (
              <div key={i} style={{ 
                padding: '12px', 
                background: '#f8fafc', 
                borderRadius: '8px',
                marginBottom: '8px'
              }}>
                <div style={{ fontWeight: '700' }}>{e.name}</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                  <span style={styles.certBadge}>{e.cert}</span>
                  Certified: {e.certDate} | Expires: {e.expiryDate}
                </div>
              </div>
            ))}
          </div>
        ) : 'Select an audit to view certification details.'
      };
    }
    
    if (prompt.toLowerCase().includes('score') || prompt.toLowerCase().includes('compliance')) {
      return {
        title: 'Compliance Score Methodology',
        content: audit ? (
          <div>
            <div style={{ 
              fontSize: '24px', 
              fontWeight: '800', 
              color: getScoreColor(audit.complianceScore).color,
              marginBottom: '12px'
            }}>
              Overall Score: {audit.complianceScore}%
            </div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Criteria</th>
                  <th style={styles.th}>Weight</th>
                  <th style={styles.th}>Score</th>
                  <th style={styles.th}>Weighted</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={styles.td}>Workload Runtime (12+ months)</td>
                  <td style={styles.td}>40%</td>
                  <td style={styles.td}>{Math.min(100, audit.workloads * 30)}%</td>
                  <td style={styles.td}>{(Math.min(100, audit.workloads * 30) * 0.4).toFixed(1)}%</td>
                </tr>
                <tr>
                  <td style={styles.td}>Employee Certifications</td>
                  <td style={styles.td}>35%</td>
                  <td style={styles.td}>{Math.min(100, audit.employees.length * 50)}%</td>
                  <td style={styles.td}>{(Math.min(100, audit.employees.length * 50) * 0.35).toFixed(1)}%</td>
                </tr>
                <tr>
                  <td style={styles.td}>Evidence Documentation</td>
                  <td style={styles.td}>25%</td>
                  <td style={styles.td}>{Math.min(100, audit.evidenceItems * 5)}%</td>
                  <td style={styles.td}>{(Math.min(100, audit.evidenceItems * 5) * 0.25).toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : 'Select an audit to view score breakdown.'
      };
    }
    
    return {
      title: 'Agent Response',
      content: <p>Analysis complete. The audit evidence has been verified against Microsoft Learn transcripts and certification records. All data points have been cross-referenced with the partner portal submissions.</p>
    };
  };
  
  const response = generateResponse();
  
  return (
    <div style={styles.agentResponse}>
      <div style={styles.responseHeader}>
        <span style={{
          width: '24px',
          height: '24px',
          background: '#22c55e',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px'
        }}>🤖</span>
        Foundry IQ Agent: {response.title}
      </div>
      {response.content}
    </div>
  );
};

// Prompt Surface Component
const PromptSurface = ({ selectedAudit, promptHistory, dispatch, samplePrompts }) => {
  const [prompt, setPrompt] = useState('');
  
  const handleSubmit = () => {
    if (!prompt.trim()) return;
    dispatch({ type: ACTIONS.ADD_PROMPT, payload: { text: prompt, timestamp: new Date().toISOString() } });
    setPrompt('');
  };
  
  const handleSamplePrompt = (text) => {
    setPrompt(text);
  };
  
  return (
    <div>
      <div style={styles.promptSurface}>
        <textarea
          style={styles.promptInput}
          placeholder="Enter verification prompt... e.g., 'Show employee skills and certification dates for this audit'"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.ctrlKey && handleSubmit()}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button style={styles.promptBtn} onClick={handleSubmit}>
            <span>🚀</span> Execute Prompt
          </button>
          {promptHistory.length > 0 && (
            <button 
              style={{ ...styles.btnSecondary, padding: '8px 16px', fontSize: '12px' }}
              onClick={() => dispatch({ type: ACTIONS.CLEAR_PROMPTS })}
            >
              Clear History
            </button>
          )}
        </div>
      </div>
      
      {promptHistory.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#475569' }}>
            Agent Responses ({promptHistory.length})
          </h4>
          {promptHistory.map((p, idx) => (
            <div key={idx}>
              <div style={{
                background: '#eff6ff',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '8px',
                fontSize: '13px'
              }}>
                <span style={{ fontWeight: '700', color: '#1d4ed8' }}>You:</span> {p.text}
              </div>
              <AgentResponse prompt={p.text} audit={selectedAudit} />
            </div>
          ))}
        </div>
      )}
      
      <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#475569' }}>
        📋 Sample Auditor Verification Prompts
      </h4>
      <SamplePromptsPanel samplePrompts={samplePrompts} onPromptSelect={handleSamplePrompt} />
    </div>
  );
};

// Platform Engineer Console Component
const PlatformEngineerConsole = ({ state, dispatch }) => {
  const [formData, setFormData] = useState({
    specializationType: '',
    requiredModules: '',
    workloadCriteria: '',
    certificationReq: '',
    numAgents: 8,
    complianceThreshold: 80,
    auditFrequency: 'Quarterly',
    verificationPeriod: '12 months'
  });
  
  const [engineerPrompt, setEngineerPrompt] = useState('');
  const [deploymentStatus, setDeploymentStatus] = useState(null);
  
  const specializationTypes = [
    'Azure AI Platform Specialization',
    'Azure Data & Analytics Specialization',
    'Azure Security Specialization',
    'Kubernetes on Azure Specialization',
    'SAP on Azure Specialization',
    'Azure VMware Solution Specialization',
    'Azure AVD Specialization',
    'Network Services on Azure Specialization',
    'HCI with Azure Local Specialization',
    'DevOps with Azure and GitHub',
    'Digital Sovereignty Specialization'
  ];
  
  const configTemplates = {
    'Azure AI Platform Specialization': {
      requiredModules: 'AI-102, AI-900, DP-100',
      workloadCriteria: 'Minimum 3 AI/ML workloads, 12 months runtime',
      certificationReq: 'At least 2 employees with AI-102, DP-100, or AI-900'
    },
    'Azure Data & Analytics Specialization': {
      requiredModules: 'DP-203, DP-900',
      workloadCriteria: '3+ data platform workloads (Synapse, Data Factory, Databricks) for 12 months',
      certificationReq: 'Minimum 2 employees with DP-203, DP-900, or DP-100'
    }
  };
  
  const handleSpecializationChange = (type) => {
    setFormData(prev => ({
      ...prev,
      specializationType: type,
      ...(configTemplates[type] || {})
    }));
  };
  
  const handleDeploy = () => {
    setDeploymentStatus('deploying');
    setTimeout(() => {
      setDeploymentStatus('success');
      dispatch({
        type: ACTIONS.CREATE_WORKFLOW,
        payload: {
          id: `WF-${Date.now()}`,
          name: formData.specializationType,
          ...formData
        }
      });
    }, 2000);
  };
  
  const sampleEngineerPrompts = [
    {
      title: 'Create Azure AI Specialization Audit',
      prompt: `Create a new audit type for Azure AI Specialization with:
- Required Modules: AI-102 (Azure AI Solution), AI-900 (Azure AI Fundamentals), DP-100
- Workload Criteria: Minimum 3 AI/ML workloads running for at least 12 months
- Employee Certification: At least 2 employees with AI-102, DP-100, or AI-900
- Verification Period: Rolling 12-month window
- Audit Frequency: Quarterly`
    },
    {
      title: 'Create Data & Analytics Audit',
      prompt: `Establish new audit type for Azure Data & Analytics Specialization:
- Required Modules: DP-203 (Data Engineering), DP-900 (Data Fundamentals)
- Workload Criteria: 3+ data platform workloads (Synapse, Data Factory, Databricks) for 12 months
- Employee Certification: Minimum 2 employees with DP-203, DP-900, or DP-100
- Performance Metrics: Query performance, data pipeline SLAs
- Review Cycle: Quarterly with annual comprehensive audit`
    }
  ];
  
  return (
    <div style={{ ...styles.mainContainer, gridTemplateColumns: '1fr 1fr' }}>
      {/* Deploy Workflow Panel */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h3 style={styles.cardTitle}>Platform Engineer Console</h3>
            <p style={styles.cardSubtitle}>Configure and deploy new Azure Specialization audit workflows</p>
          </div>
        </div>
        <div style={styles.cardBody}>
          <div style={styles.form}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Specialization Type</label>
              <select
                style={styles.select}
                value={formData.specializationType}
                onChange={(e) => handleSpecializationChange(e.target.value)}
              >
                <option value="">Select Specialization...</option>
                {specializationTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            
            {formData.specializationType && (
              <div style={styles.configBox}>
                <div style={styles.configTitle}>
                  Example: {formData.specializationType} Configuration
                </div>
                <div style={{ fontSize: '13px', color: '#475569' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Required Modules:</strong>
                    <div style={{ marginTop: '4px' }}>
                      {(formData.requiredModules || 'AI-102, AI-900').split(', ').map(m => (
                        <span key={m} style={styles.certBadge}>{m}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Workload Criteria:</strong> {formData.workloadCriteria || 'Minimum 3 workloads, 12 months runtime'}
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Employee Certification:</strong> {formData.certificationReq || 'At least 2 employees certified'}
                  </div>
                  <div>
                    <strong>Audit Frequency:</strong> {formData.auditFrequency}
                  </div>
                </div>
              </div>
            )}

            <div style={styles.formGroup}>
              <label style={styles.label}>Compliance Threshold (%)</label>
              <input
                type="number"
                style={styles.input}
                value={formData.complianceThreshold}
                onChange={(e) => setFormData(prev => ({ ...prev, complianceThreshold: parseInt(e.target.value) }))}
                min={0}
                max={100}
              />
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Minimum score required for approval
              </span>
            </div>
            
            <div style={styles.actionBtns}>
              <button style={styles.btnSecondary}>Cancel</button>
              <button 
                style={styles.btnPrimary}
                onClick={handleDeploy}
                disabled={!formData.specializationType}
              >
                {deploymentStatus === 'deploying' ? (
                  <>⏳ Deploying...</>
                ) : deploymentStatus === 'success' ? (
                  <>✅ Deployed!</>
                ) : (
                  <>🚀 Deploy Agents & Start Audit</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Prompt Configuration Panel */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h3 style={styles.cardTitle}>Workflow Configuration via Prompts</h3>
            <p style={styles.cardSubtitle}>Configure audit workflows using natural language</p>
          </div>
        </div>
        <div style={styles.cardBody}>
          <div style={styles.promptSurface}>
            <textarea
              style={{ ...styles.promptInput, minHeight: '120px' }}
              placeholder="Describe the audit workflow you want to create..."
              value={engineerPrompt}
              onChange={(e) => setEngineerPrompt(e.target.value)}
            />
            <button style={styles.promptBtn}>
              <span>⚙️</span> Configure Workflow
            </button>
          </div>
          
          <h4 style={{ margin: '20px 0 12px 0', fontSize: '14px', color: '#475569' }}>
            📋 Sample Configuration Prompts
          </h4>
          {sampleEngineerPrompts.map((p, idx) => (
            <div
              key={idx}
              style={{
                ...styles.samplePromptCard,
                padding: '16px'
              }}
              onClick={() => setEngineerPrompt(p.prompt)}
            >
              <div style={{ fontWeight: '700', marginBottom: '8px', color: '#1e3a5f' }}>
                {p.title}
              </div>
              <div style={{ 
                fontSize: '12px', 
                color: '#64748b',
                whiteSpace: 'pre-wrap',
                lineHeight: '1.5'
              }}>
                {p.prompt}
              </div>
            </div>
          ))}
          
          <div style={{ marginTop: '24px' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#475569' }}>
              🔧 Active Workflow Templates
            </h4>
            {state.workflowTemplates.map(wf => (
              <div key={wf.id} style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '8px'
              }}>
                <div style={{ fontWeight: '700', color: '#1e3a5f', marginBottom: '4px' }}>
                  {wf.name}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Modules: {wf.requiredModules?.join(', ')} | Frequency: {wf.auditFrequency}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Partner Portal Component
const PartnerPortal = ({ state, dispatch }) => {
  const [selectedSpecialization, setSelectedSpecialization] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [submissionHistory, setSubmissionHistory] = useState([
    { id: 'SUB-001', date: '2026-02-10', specialization: 'AI Platform on Microsoft Azure', files: 5, status: 'approved' },
    { id: 'SUB-002', date: '2026-02-05', specialization: 'Analytics on Azure', files: 8, status: 'pending_review' },
    { id: 'SUB-003', date: '2026-01-28', specialization: 'Kubernetes on Microsoft Azure', files: 3, status: 'rejected' }
  ]);

  const specializations = [
    { id: 'ai-platform', name: 'AI Platform on Microsoft Azure Specialization', icon: '🤖', requiredDocs: ['Customer References', 'Workload Screenshots', 'Certification Proof', 'Architecture Diagrams'] },
    { id: 'analytics', name: 'Analytics on Azure Specialization', icon: '📊', requiredDocs: ['Data Pipeline Configs', 'Synapse Workspaces', 'Performance Reports', 'Certification Proof'] },
    { id: 'kubernetes', name: 'Kubernetes on Microsoft Azure Specialization', icon: '☸️', requiredDocs: ['AKS Cluster Configs', 'Deployment YAMLs', 'Monitoring Dashboards', 'Certification Proof'] },
    { id: 'security', name: 'Azure Security Specialization', icon: '🔒', requiredDocs: ['Security Assessments', 'Sentinel Configs', 'Compliance Reports', 'Certification Proof'] },
    { id: 'devops', name: 'DevOps with Azure and GitHub', icon: '🔄', requiredDocs: ['Pipeline Configs', 'CI/CD Evidence', 'GitHub Actions Logs', 'Certification Proof'] },
    { id: 'sap', name: 'SAP on Microsoft Azure Specialization', icon: '💼', requiredDocs: ['SAP Landscape Diagrams', 'Performance Metrics', 'Migration Evidence', 'Certification Proof'] }
  ];

  const handleUploadComplete = (files) => {
    setUploadedFiles(prev => [...prev, ...files]);
  };

  const handleSubmitEvidence = () => {
    if (selectedSpecialization && uploadedFiles.length > 0) {
      const newSubmission = {
        id: `SUB-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        specialization: selectedSpecialization.name,
        files: uploadedFiles.length,
        status: 'pending_review'
      };
      setSubmissionHistory(prev => [newSubmission, ...prev]);
      setUploadedFiles([]);
      setSelectedSpecialization(null);
      alert('Evidence submitted successfully! Your submission is now pending review.');
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'approved': return { background: '#dcfce7', color: '#166534' };
      case 'rejected': return { background: '#fee2e2', color: '#991b1b' };
      default: return { background: '#fef3c7', color: '#92400e' };
    }
  };

  const portalStyles = {
    container: {
      padding: '24px',
      maxWidth: '1400px',
      margin: '0 auto'
    },
    header: {
      marginBottom: '24px'
    },
    title: {
      fontSize: '24px',
      fontWeight: '700',
      color: '#1e3a5f',
      margin: '0 0 8px 0'
    },
    subtitle: {
      fontSize: '14px',
      color: '#64748b',
      margin: 0
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: '16px',
      marginBottom: '24px'
    },
    specCard: {
      background: '#fff',
      borderRadius: '12px',
      padding: '20px',
      border: '2px solid #e2e8f0',
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    },
    specCardSelected: {
      borderColor: '#3b82f6',
      background: '#eff6ff',
      boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)'
    },
    specIcon: {
      fontSize: '32px',
      marginBottom: '12px'
    },
    specName: {
      fontSize: '16px',
      fontWeight: '700',
      color: '#1e293b',
      marginBottom: '8px'
    },
    specDocs: {
      fontSize: '12px',
      color: '#64748b'
    },
    uploadSection: {
      background: '#fff',
      borderRadius: '16px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      marginBottom: '24px',
      overflow: 'hidden'
    },
    sectionHeader: {
      padding: '20px 24px',
      borderBottom: '1px solid #e2e8f0',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    sectionTitle: {
      fontSize: '18px',
      fontWeight: '700',
      color: '#1e293b',
      margin: 0
    },
    historyTable: {
      width: '100%',
      borderCollapse: 'collapse'
    },
    th: {
      textAlign: 'left',
      padding: '12px 16px',
      background: '#f8fafc',
      fontWeight: '700',
      fontSize: '12px',
      color: '#64748b',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    },
    td: {
      padding: '16px',
      borderBottom: '1px solid #e2e8f0',
      fontSize: '14px'
    },
    badge: {
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: '700',
      textTransform: 'uppercase'
    },
    submitBtn: {
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
    statsRow: {
      display: 'flex',
      gap: '16px',
      marginBottom: '24px'
    },
    statBox: {
      flex: 1,
      background: '#fff',
      borderRadius: '12px',
      padding: '20px',
      textAlign: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
    },
    statValue: {
      fontSize: '28px',
      fontWeight: '800',
      marginBottom: '4px'
    },
    statLabel: {
      fontSize: '12px',
      fontWeight: '600',
      color: '#64748b',
      textTransform: 'uppercase'
    }
  };

  return (
    <div style={portalStyles.container}>
      {/* Header */}
      <div style={portalStyles.header}>
        <h1 style={portalStyles.title}>🏢 Partner Evidence Portal</h1>
        <p style={portalStyles.subtitle}>
          Submit audit evidence for your Azure Specialization certifications
        </p>
      </div>

      {/* Stats Row */}
      <div style={portalStyles.statsRow}>
        <div style={portalStyles.statBox}>
          <div style={{ ...portalStyles.statValue, color: '#3b82f6' }}>
            {submissionHistory.length}
          </div>
          <div style={portalStyles.statLabel}>Total Submissions</div>
        </div>
        <div style={portalStyles.statBox}>
          <div style={{ ...portalStyles.statValue, color: '#f59e0b' }}>
            {submissionHistory.filter(s => s.status === 'pending_review').length}
          </div>
          <div style={portalStyles.statLabel}>Pending Review</div>
        </div>
        <div style={portalStyles.statBox}>
          <div style={{ ...portalStyles.statValue, color: '#22c55e' }}>
            {submissionHistory.filter(s => s.status === 'approved').length}
          </div>
          <div style={portalStyles.statLabel}>Approved</div>
        </div>
        <div style={portalStyles.statBox}>
          <div style={{ ...portalStyles.statValue, color: '#ef4444' }}>
            {submissionHistory.filter(s => s.status === 'rejected').length}
          </div>
          <div style={portalStyles.statLabel}>Rejected</div>
        </div>
      </div>

      {/* Step 1: Select Specialization */}
      <div style={portalStyles.uploadSection}>
        <div style={portalStyles.sectionHeader}>
          <h3 style={portalStyles.sectionTitle}>
            Step 1: Select Azure Specialization
          </h3>
          {selectedSpecialization && (
            <span style={{
              background: '#dbeafe',
              color: '#1d4ed8',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: '600'
            }}>
              ✓ {selectedSpecialization.name}
            </span>
          )}
        </div>
        <div style={{ padding: '20px' }}>
          <div style={portalStyles.grid}>
            {specializations.map(spec => (
              <div
                key={spec.id}
                style={{
                  ...portalStyles.specCard,
                  ...(selectedSpecialization?.id === spec.id ? portalStyles.specCardSelected : {})
                }}
                onClick={() => setSelectedSpecialization(spec)}
              >
                <div style={portalStyles.specIcon}>{spec.icon}</div>
                <div style={portalStyles.specName}>{spec.name}</div>
                <div style={portalStyles.specDocs}>
                  <strong>Required Documents:</strong>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '16px' }}>
                    {spec.requiredDocs.map((doc, idx) => (
                      <li key={idx} style={{ marginBottom: '4px' }}>{doc}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step 2: Upload Evidence */}
      {selectedSpecialization && (
        <div style={portalStyles.uploadSection}>
          <div style={portalStyles.sectionHeader}>
            <h3 style={portalStyles.sectionTitle}>
              Step 2: Upload Evidence Files
            </h3>
            {uploadedFiles.length > 0 && (
              <span style={{
                background: '#dcfce7',
                color: '#166534',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: '600'
              }}>
                {uploadedFiles.length} file(s) ready
              </span>
            )}
          </div>
          <FileUpload
            auditId={`partner-${selectedSpecialization.id}`}
            auditName={selectedSpecialization.name}
            onUploadComplete={handleUploadComplete}
          />
        </div>
      )}

      {/* Step 3: Submit */}
      {selectedSpecialization && uploadedFiles.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '20px',
          background: '#fff',
          borderRadius: '12px',
          marginBottom: '24px'
        }}>
          <button style={portalStyles.submitBtn} onClick={handleSubmitEvidence}>
            <span>📤</span> Submit Evidence for Review
          </button>
        </div>
      )}

      {/* Submission History */}
      <div style={portalStyles.uploadSection}>
        <div style={portalStyles.sectionHeader}>
          <h3 style={portalStyles.sectionTitle}>📜 Submission History</h3>
        </div>
        <table style={portalStyles.historyTable}>
          <thead>
            <tr>
              <th style={portalStyles.th}>Submission ID</th>
              <th style={portalStyles.th}>Date</th>
              <th style={portalStyles.th}>Specialization</th>
              <th style={portalStyles.th}>Files</th>
              <th style={portalStyles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {submissionHistory.map(sub => (
              <tr key={sub.id}>
                <td style={portalStyles.td}>
                  <strong>{sub.id}</strong>
                </td>
                <td style={portalStyles.td}>{sub.date}</td>
                <td style={portalStyles.td}>{sub.specialization}</td>
                <td style={portalStyles.td}>{sub.files} files</td>
                <td style={portalStyles.td}>
                  <span style={{
                    ...portalStyles.badge,
                    ...getStatusStyle(sub.status)
                  }}>
                    {sub.status === 'pending_review' ? 'Pending Review' :
                     sub.status === 'approved' ? 'Approved' : 'Rejected'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Auditor Workbench Component
const AuditorWorkbench = ({ state, dispatch }) => (
  <>
    {/* Stats Banner */}
    <div style={{
      padding: '16px 20px',
      background: '#fff',
      borderBottom: '2px solid #e2e8f0',
      margin: '0 20px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <div>
          <h2 style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: '700',
            color: '#1e3a5f'
          }}>
            🔍 Auditor Workbench
          </h2>
          <p style={{
            margin: '4px 0 0 0',
            fontSize: '13px',
            color: '#64748b'
          }}>
            Review and verify Azure specialization compliance evidence
          </p>
        </div>
      </div>
      <StatsDashboard
        stats={state.stats}
        cosmosAudits={state.cosmosAudits}
      />
    </div>

    <div style={styles.mainContainer}>
      {/* Left Panel - Audit Queue */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h3 style={styles.cardTitle}>📋 Audit Queue</h3>
            <p style={styles.cardSubtitle}>Select an audit to review evidence and verify compliance</p>
          </div>
        </div>
        <div style={styles.cardBody}>
          <AuditQueue
            cosmosAudits={state.cosmosAudits}
            cosmosLoading={state.cosmosLoading}
            cosmosError={state.cosmosError}
            filterStatus={state.filterStatus}
            selectedAudit={state.selectedAudit}
            dispatch={dispatch}
          />
        </div>
      </div>
    
    {/* Center Panel - Evidence Viewer */}
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <h3 style={styles.cardTitle}>
            {state.selectedAudit ? state.selectedAudit.name : 'Evidence Viewer'}
          </h3>
          <p style={styles.cardSubtitle}>
            {state.selectedAudit 
              ? `Partner: ${state.selectedAudit.partner} | Last Reviewed: ${state.selectedAudit.lastReviewed}`
              : 'Select an audit from the queue'
            }
          </p>
        </div>
        {state.selectedAudit && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              style={{ ...styles.btnPrimary, padding: '10px 16px', fontSize: '13px' }}
              onClick={() => dispatch({ 
                type: ACTIONS.UPDATE_AUDIT_STATUS, 
                payload: { id: state.selectedAudit.id, status: 'approved' }
              })}
            >
              ✓ Approve
            </button>
            <button 
              style={{ ...styles.btnSecondary, padding: '10px 16px', fontSize: '13px', background: '#dc2626' }}
              onClick={() => dispatch({ 
                type: ACTIONS.UPDATE_AUDIT_STATUS, 
                payload: { id: state.selectedAudit.id, status: 'rejected' }
              })}
            >
              ✗ Reject
            </button>
          </div>
        )}
      </div>
      <div style={styles.cardBody}>
        <EvidenceViewer audit={state.selectedAudit} />
      </div>
    </div>
    
    {/* Right Panel - Prompt Surface */}
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <h3 style={styles.cardTitle}>AI Verification Agent</h3>
          <p style={styles.cardSubtitle}>Query evidence using natural language prompts</p>
        </div>
      </div>
      <div style={{ ...styles.cardBody, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
        <PromptSurface
          selectedAudit={state.selectedAudit}
          promptHistory={state.promptHistory}
          dispatch={dispatch}
          samplePrompts={state.samplePrompts}
        />
      </div>
    </div>
  </div>
  </>
);

// ==================== MAIN APP ====================
export default function AuditXApp() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load Cosmos DB data on startup
  useEffect(() => {
    const loadCosmosData = async () => {
      dispatch({ type: ACTIONS.SET_COSMOS_LOADING, payload: true });

      try {
        console.log('Attempting to fetch data from Cosmos DB...');
        console.log('Database: AuditResults, Container: Audits');

        // Try to fetch from Cosmos DB
        const documents = await fetchAuditsFromCosmosDB();

        if (documents && documents.length > 0) {
          console.log(`Fetched ${documents.length} documents from Cosmos DB`);

          // Transform all documents
          const cosmosAudits = documents.map(doc => transformAuditDocument(doc));

          dispatch({ type: ACTIONS.SET_COSMOS_AUDITS, payload: cosmosAudits });
        } else {
          console.log('No documents found, using sample data');
          loadSampleData();
        }
      } catch (error) {
        console.error('Failed to fetch from Cosmos DB:', error);
        dispatch({ type: ACTIONS.SET_COSMOS_ERROR, payload: error.message });
        loadSampleData();
      }
    };

    const loadSampleData = () => {
      // Transform sample Cosmos DB data
      const sampleCosmosData = getSampleCosmosAudit();
      const transformedAudit = transformAuditDocument(sampleCosmosData);

      // Add additional sample audits from Cosmos DB format
      const cosmosAudits = [
        transformedAudit,
        // Add more sample audits with variations
        {
          ...transformAuditDocument({
            ...sampleCosmosData,
            id: 'cosmos-002',
            auditId: 'cosmos-002',
            overallScore: 72,
            passStatus: 1,
            primaryDocumentName: 'Contoso_Analytics_Azure_Assessment_v2.docx',
            moduleBScore: {
              ...sampleCosmosData.moduleBScore,
              moduleName: 'Analytics on Azure Specialization',
              score: 65
            }
          }),
          dueDate: '2026-02-20',
          slaDate: '2026-03-01'
        },
        {
          ...transformAuditDocument({
            ...sampleCosmosData,
            id: 'cosmos-003',
            auditId: 'cosmos-003',
            overallScore: 88,
            passStatus: 0,
            primaryDocumentName: 'TechCorp_Kubernetes_Azure_Audit_v1.docx',
            moduleBScore: {
              ...sampleCosmosData.moduleBScore,
              moduleName: 'Kubernetes on Microsoft Azure',
              score: 85
            }
          }),
          status: 'approved',
          dueDate: '2026-02-25',
          slaDate: '2026-03-05'
        }
      ];

      dispatch({ type: ACTIONS.SET_COSMOS_AUDITS, payload: cosmosAudits });
    };

    loadCosmosData();
  }, []);

  return (
    <div style={styles.app}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        * {
          box-sizing: border-box;
        }
        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
      
      <Header state={state} dispatch={dispatch} />
      
      {state.currentPersona === 'auditor' && (
        <AuditorWorkbench state={state} dispatch={dispatch} />
      )}
      {state.currentPersona === 'engineer' && (
        <PlatformEngineerConsole state={state} dispatch={dispatch} />
      )}
      {state.currentPersona === 'partner' && (
        <PartnerPortal state={state} dispatch={dispatch} />
      )}
      
      {/* Footer */}
      <footer style={{
        padding: '16px 32px',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#fff',
        fontSize: '13px',
        color: '#64748b'
      }}>
        <div>Confidential © 2026 Persistent Systems</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#f97316', fontWeight: '700' }}>Re(AI)magining</span>
          <span>the World</span>
        </div>
      </footer>
    </div>
  );
}
