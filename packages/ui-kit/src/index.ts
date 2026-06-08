// @piper/ui-kit 入口。详见 ../README.md 与 docs/ECOSYSTEM-PLAN.md §4 T-piper-1。

export type {
  PiperApiClient,
  DefaultClientOptions,
} from './client'
export { createDefaultClient, resolveAbsoluteUrl } from './client'

export type { PiperUIProviderProps } from './context'
export { PiperUIProvider, usePiperApi } from './context'

export type {
  CaptureStreamHandlers,
  StreamFilter,
} from './hooks/useCaptureStream'
export { useCaptureStream } from './hooks/useCaptureStream'

// lib
export { cn } from './lib/cn'
export { whistleLang } from './lib/cm-whistle'

// components/ui
export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './components/ui/alert-dialog'
export { Button, type ButtonProps } from './components/ui/button'
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog'
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './components/ui/dropdown-menu'
export { Switch } from './components/ui/switch'
export {
  ToolbarGroup,
  ToolbarButton,
  ToolbarSelect,
  ToolbarLabel,
  useToolbarSize,
  toolbarIconCls,
  type ToolbarSize,
  type ToolbarButtonProps,
  type ToolbarSelectProps,
} from './components/ui/toolbar'

// shared components
export { CodeView, detectLanguage, type CodeLang } from './components/CodeView'
export { MethodBadge } from './components/MethodBadge'
export {
  ThrottleDropdown,
  THROTTLE_PRESETS,
  type ThrottleConfig,
  type ThrottlePresetId,
  type ThrottleDropdownProps,
} from './components/ThrottleDropdown'

// types
export type {
  CaptureReq,
  CaptureRes,
  CaptureItem,
  NetworkItem,
  NetworkInterface,
  NetworkInterfacesResponse,
} from './types'

// stores
export {
  useNetworkStore,
  COLUMN_KEYS,
  DEFAULT_COLUMNS,
  TYPE_FILTERS,
  type ColumnKey,
  type ColumnConfig,
  type TypeFilter,
} from './stores/network'
export { useDetailLayoutStore, type DetailLayout } from './stores/detailLayout'
export {
  useSearchFiltersStore,
  type FilterField,
  type FilterOp,
  type FilterClause,
  type FilterSet,
  type SavedFilter,
} from './stores/searchFilters'
export { useWorkingSessionStore, type PinnedEntry } from './stores/workingSession'
export { useDiffPoolStore, type DiffPoolState } from './stores/diffPool'

// lib utilities
export { headersToText, copyToClipboard, getHeader, getRequestCookie } from './lib/curl'
export { useNetworkShortcuts, type NetworkShortcutId } from './lib/use-network-shortcuts'

// network prefs store
export {
  useNetworkPrefs,
  DEFAULT_PREFS,
  DEFAULT_PREFS as DEFAULT_NETWORK_PREFS,
  MAX_ROWS_OPTIONS,
  type NetworkPrefs,
} from './stores/networkPrefs'

// api
export {
  normalizeCapture,
  setHighlight,
  setComment,
  fetchCaptureCurl,
  fetchNetworkInterfaces,
  addValue,
} from './api/network'

// network components
export { NetworkPanel, type NetworkPanelProps } from './components/network/NetworkPanel'
export { NetworkList } from './components/network/NetworkList'
export { NetworkDetail } from './components/network/NetworkDetail'
export { NetworkToolbar } from './components/network/NetworkToolbar'
export { NetworkSidebar } from './components/network/NetworkSidebar'
export { NetworkTimeline } from './components/network/NetworkTimeline'
export { NetworkTreeView } from './components/network/NetworkTreeView'
export { RowContextMenu, type RowContextMenuProps } from './components/network/RowContextMenu'
export { SearchFilterBar } from './components/network/SearchFilterBar'
export { TimingDialog } from './components/network/TimingDialog'
export { TypeFilterTabs } from './components/network/TypeFilterTabs'
export { matchesFilterSet } from './components/network/filter-match'
export {
  buildMockRule,
  genMockValuesName,
  type MockValueEntry,
  type BuiltMock,
} from './components/network/mock-rule'

// lib utilities (E1)
export { runMutation, type MutationResult } from './lib/mutate'
export {
  useEditorPrefs,
  EDITOR_THEMES,
  FONT_SIZE_OPTIONS,
  type EditorPrefs,
} from './lib/editor-prefs'

// api (E2)
export {
  fetchRulesList,
  fetchRulesGlobalState,
  saveRule,
  addRuleGroup,
  removeRuleGroup,
  renameRuleGroup,
  enableRule,
  disableRule,
  setDisableAllRules,
  setAllowMultipleChoice,
  toggleDefaultRulesDisabled,
  importRulesFile,
  exportRulesUrl,
  RULES_LIST_URL,
  RULES_GLOBAL_URL,
  type RuleItem,
  type RulesListResp,
  type RulesGlobalState,
} from './api/rules'
export {
  fetchHttpsStatus,
  fetchAllCerts,
  setIntercept,
  setEnableHttp2,
  uploadCerts,
  removeCert,
  setCertActive,
  downloadCa,
  HTTPS_STATUS_URL,
  CERTS_ALL_URL,
  type HttpsStatus,
  type CustomCertFile,
  type CertsAllResponse,
  type CertUploadEntry,
} from './api/https'
export {
  fetchCAInfo,
  installCATrust,
  rotateCA,
  resetCA,
  CA_INFO_URL,
  type CAInfo,
} from './api/wizard'
export { fetchDiagnostics, type DiagnosticItem, type DiagnosticsResult } from './api/setup'
export { fetchValues, VALUES_URL, type ValueItem } from './api/values'
export { fetchPlugins, PLUGINS_URL, type PluginItem, type PluginsResp } from './api/plugins'

// rules components (E3)
export { RulesPanel } from './components/rules/RulesPanel'
export { RulesToolbar } from './components/rules/RulesToolbar'
export { RuleListItem } from './components/rules/RuleListItem'
export { NewGroupDialog } from './components/rules/NewGroupDialog'
export { RenameDialog as RulesRenameDialog } from './components/rules/RenameDialog'
export { createWhistleAutocompletion, type VarHintProvider, type CategoryLabels } from './components/rules/cm-whistle-autocomplete'
export { useRulesAutocompleteData } from './components/rules/use-rules-autocomplete-data'

// https components (E4)
export { HttpsPanel } from './components/https/HttpsPanel'
export { CertsManager } from './components/https/CertsManager'
export { CertDetailDialog } from './components/https/CertDetailDialog'
export { CertUploadDialog } from './components/https/CertUploadDialog'
export { TrustWizard } from './components/https/TrustWizard'

// dialogs
export {
  CookiesDialog,
  parseCookieHeader,
  serializeCookies,
  type CookieEntry,
  type CookiesDialogProps,
} from './components/dialogs/CookiesDialog'
export { TextDialog, type TextDialogProps } from './components/dialogs/TextDialog'
export { ListDialog, type ListItem, type ListDialogProps } from './components/dialogs/ListDialog'
export { JsonDialog, type JsonDialogProps } from './components/dialogs/JsonDialog'
export { MockDialog, type MockConfig, type MockDialogProps } from './components/dialogs/MockDialog'
export { QrcodeDialog, type QrcodeDialogProps } from './components/dialogs/QrcodeDialog'
