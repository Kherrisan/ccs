/**
 * Context Hooks
 * Hooks for accessing and updating settings context state
 */

import { useCallback, useContext, useMemo } from 'react';
import { SettingsContext } from '../settings-context';
import type {
  BrowserConfig,
  BrowserStatus,
  WebSearchConfig,
  GlobalEnvConfig,
  CliproxyServerConfig,
  WebSearchStatus,
  RemoteProxyStatus,
} from '../types';

export function useSettingsContext() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettingsContext must be used within a SettingsProvider');
  }
  return context;
}

export function useSettingsActions() {
  const { dispatch } = useSettingsContext();

  const setBrowserConfig = useCallback(
    (config: BrowserConfig | null) => dispatch({ type: 'SET_BROWSER_CONFIG', payload: config }),
    [dispatch]
  );

  const setBrowserStatus = useCallback(
    (status: BrowserStatus | null) => dispatch({ type: 'SET_BROWSER_STATUS', payload: status }),
    [dispatch]
  );

  const setBrowserLoading = useCallback(
    (loading: boolean) => dispatch({ type: 'SET_BROWSER_LOADING', payload: loading }),
    [dispatch]
  );

  const setBrowserStatusLoading = useCallback(
    (loading: boolean) => dispatch({ type: 'SET_BROWSER_STATUS_LOADING', payload: loading }),
    [dispatch]
  );

  const setBrowserSaving = useCallback(
    (saving: boolean) => dispatch({ type: 'SET_BROWSER_SAVING', payload: saving }),
    [dispatch]
  );

  const setBrowserError = useCallback(
    (error: string | null) => dispatch({ type: 'SET_BROWSER_ERROR', payload: error }),
    [dispatch]
  );

  const setBrowserSuccess = useCallback(
    (success: boolean) => dispatch({ type: 'SET_BROWSER_SUCCESS', payload: success }),
    [dispatch]
  );

  const setWebSearchConfig = useCallback(
    (config: WebSearchConfig | null) => dispatch({ type: 'SET_WEBSEARCH_CONFIG', payload: config }),
    [dispatch]
  );

  const setWebSearchStatus = useCallback(
    (status: WebSearchStatus | null) => dispatch({ type: 'SET_WEBSEARCH_STATUS', payload: status }),
    [dispatch]
  );

  const setWebSearchLoading = useCallback(
    (loading: boolean) => dispatch({ type: 'SET_WEBSEARCH_LOADING', payload: loading }),
    [dispatch]
  );

  const setWebSearchStatusLoading = useCallback(
    (loading: boolean) => dispatch({ type: 'SET_WEBSEARCH_STATUS_LOADING', payload: loading }),
    [dispatch]
  );

  const setWebSearchSaving = useCallback(
    (saving: boolean) => dispatch({ type: 'SET_WEBSEARCH_SAVING', payload: saving }),
    [dispatch]
  );

  const setWebSearchError = useCallback(
    (error: string | null) => dispatch({ type: 'SET_WEBSEARCH_ERROR', payload: error }),
    [dispatch]
  );

  const setWebSearchSuccess = useCallback(
    (success: boolean) => dispatch({ type: 'SET_WEBSEARCH_SUCCESS', payload: success }),
    [dispatch]
  );

  const setGlobalEnvConfig = useCallback(
    (config: GlobalEnvConfig | null) => dispatch({ type: 'SET_GLOBALENV_CONFIG', payload: config }),
    [dispatch]
  );

  const setGlobalEnvLoading = useCallback(
    (loading: boolean) => dispatch({ type: 'SET_GLOBALENV_LOADING', payload: loading }),
    [dispatch]
  );

  const setGlobalEnvSaving = useCallback(
    (saving: boolean) => dispatch({ type: 'SET_GLOBALENV_SAVING', payload: saving }),
    [dispatch]
  );

  const setGlobalEnvError = useCallback(
    (error: string | null) => dispatch({ type: 'SET_GLOBALENV_ERROR', payload: error }),
    [dispatch]
  );

  const setGlobalEnvSuccess = useCallback(
    (success: boolean) => dispatch({ type: 'SET_GLOBALENV_SUCCESS', payload: success }),
    [dispatch]
  );

  const setProxyConfig = useCallback(
    (config: CliproxyServerConfig | null) =>
      dispatch({ type: 'SET_PROXY_CONFIG', payload: config }),
    [dispatch]
  );

  const setProxyLoading = useCallback(
    (loading: boolean) => dispatch({ type: 'SET_PROXY_LOADING', payload: loading }),
    [dispatch]
  );

  const setProxySaving = useCallback(
    (saving: boolean) => dispatch({ type: 'SET_PROXY_SAVING', payload: saving }),
    [dispatch]
  );

  const setProxyError = useCallback(
    (error: string | null) => dispatch({ type: 'SET_PROXY_ERROR', payload: error }),
    [dispatch]
  );

  const setProxySuccess = useCallback(
    (success: boolean) => dispatch({ type: 'SET_PROXY_SUCCESS', payload: success }),
    [dispatch]
  );

  const setProxyTestResult = useCallback(
    (result: RemoteProxyStatus | null) =>
      dispatch({ type: 'SET_PROXY_TEST_RESULT', payload: result }),
    [dispatch]
  );

  const setProxyTesting = useCallback(
    (testing: boolean) => dispatch({ type: 'SET_PROXY_TESTING', payload: testing }),
    [dispatch]
  );

  const setRawConfig = useCallback(
    (config: string | null) => dispatch({ type: 'SET_RAW_CONFIG', payload: config }),
    [dispatch]
  );

  const setRawConfigLoading = useCallback(
    (loading: boolean) => dispatch({ type: 'SET_RAW_CONFIG_LOADING', payload: loading }),
    [dispatch]
  );

  return useMemo(
    () => ({
      setBrowserConfig,
      setBrowserStatus,
      setBrowserLoading,
      setBrowserStatusLoading,
      setBrowserSaving,
      setBrowserError,
      setBrowserSuccess,
      setWebSearchConfig,
      setWebSearchStatus,
      setWebSearchLoading,
      setWebSearchStatusLoading,
      setWebSearchSaving,
      setWebSearchError,
      setWebSearchSuccess,
      setGlobalEnvConfig,
      setGlobalEnvLoading,
      setGlobalEnvSaving,
      setGlobalEnvError,
      setGlobalEnvSuccess,
      setProxyConfig,
      setProxyLoading,
      setProxySaving,
      setProxyError,
      setProxySuccess,
      setProxyTestResult,
      setProxyTesting,
      setRawConfig,
      setRawConfigLoading,
    }),
    [
      setBrowserConfig,
      setBrowserStatus,
      setBrowserLoading,
      setBrowserStatusLoading,
      setBrowserSaving,
      setBrowserError,
      setBrowserSuccess,
      setWebSearchConfig,
      setWebSearchStatus,
      setWebSearchLoading,
      setWebSearchStatusLoading,
      setWebSearchSaving,
      setWebSearchError,
      setWebSearchSuccess,
      setGlobalEnvConfig,
      setGlobalEnvLoading,
      setGlobalEnvSaving,
      setGlobalEnvError,
      setGlobalEnvSuccess,
      setProxyConfig,
      setProxyLoading,
      setProxySaving,
      setProxyError,
      setProxySuccess,
      setProxyTestResult,
      setProxyTesting,
      setRawConfig,
      setRawConfigLoading,
    ]
  );
}
