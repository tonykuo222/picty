import fs from 'fs'
import { remote, shell } from 'electron'
import File from '../utils/file'

const sortReversed = {
  name: false,
  size: false,
  mtime: true
}

let watcher = null

export default {
  namespaced: true,
  state: {
    items: [],
    directoryInput: '',
    query: '',
    queryInput: '',
    selectedFilepath: '',
    histories: [],
    historyIndex: -1,
    sortOptions: {}
  },
  actions: {
    initDirectory ({ dispatch, rootState }) {
      const dirpath = rootState.directory
      dispatch('changeDirectory', { dirpath, force: true })
    },
    changeParentDirectory ({ dispatch, rootState }) {
      const dirpath = (new File(rootState.directory)).parent.path
      dispatch('changeDirectory', { dirpath })
    },
    changeHomeDirectory ({ dispatch }) {
      const dirpath = remote.app.getPath('home')
      dispatch('changeDirectory', { dirpath })
    },
    changeSelectedDirectory ({ dispatch, state }) {
      if (state.selectedFilepath && (new File(state.selectedFilepath)).isDirectory()) {
        const dirpath = state.selectedFilepath
        dispatch('changeDirectory', { dirpath })
      }
    },
    changeDirectory ({ commit, dispatch, state, rootState }, { dirpath, force = false }) {
      if (dirpath === rootState.directory && !force) {
        return
      }
      const historyIndex = state.historyIndex + 1
      const histories = [...state.histories.slice(0, historyIndex), {
        directory: dirpath,
        scrollTop: 0
      }]
      commit('setSelectedFilepath', { selectedFilepath: '' })
      commit('setHistories', { histories })
      commit('setHistoryIndex', { historyIndex })

      dispatch('restoreDirectory', { historyIndex })
    },
    backDirectory ({ getters, dispatch, state }, { offset = 0 } = {}) {
      if (!getters.canBackDirectory) {
        return
      }
      const historyIndex = state.historyIndex - 1 - offset
      dispatch('restoreDirectory', { historyIndex })
    },
    forwardDirectory ({ getters, dispatch, state }, { offset = 0 } = {}) {
      if (!getters.canForwardDirectory) {
        return
      }
      const historyIndex = state.historyIndex + 1 + offset
      dispatch('restoreDirectory', { historyIndex })
    },
    restoreDirectory ({ commit, dispatch, state }, { historyIndex }) {
      const history = state.histories[historyIndex]
      commit('setHistoryIndex', { historyIndex })

      commit('setDirectory', { directory: history.directory }, { root: true })
      commit('setDirectoryInput', { directoryInput: history.directory })
      commit('setQuery', { query: '' })

      dispatch('load')
    },
    load ({ commit, dispatch, rootState }) {
      try {
        if (watcher) {
          watcher.close()
        }
        watcher = fs.watch(rootState.directory, () => {
          dispatch('load')
        })
        const items = File.listFiles(rootState.directory)
          .filter((file) => file.isDirectory() || file.isImage())
          .map((file) => file.toObject())
        commit('setItems', { items })
      } catch (e) {
        commit('setItems', { items: [] })
      }
      dispatch('sort')
      dispatch('focusExplorerTable', null, { root: true })
    },
    openDirectory ({ dispatch, rootState }) {
      const result = shell.openItem(rootState.directory)
      if (!result) {
        dispatch('showMessage', { message: `Invalid directory "${rootState.directory}"` }, { root: true })
      }
    },
    select ({ commit }, { filepath }) {
      commit('setSelectedFilepath', { selectedFilepath: filepath })
    },
    selectIndex ({ dispatch, getters }, { index }) {
      if (index < 0 || index > getters.filteredItems.length - 1) {
        return
      }
      const filepath = getters.filteredItems[index].path
      dispatch('select', { filepath })
    },
    selectFirst ({ dispatch }) {
      dispatch('selectIndex', { index: 0 })
    },
    selectLast ({ dispatch, getters }) {
      dispatch('selectIndex', { index: getters.filteredItems.length - 1 })
    },
    selectPrevious ({ dispatch, getters }) {
      dispatch('selectIndex', { index: getters.selectedIndex - 1 })
    },
    selectNext ({ dispatch, getters, state }) {
      dispatch('selectIndex', { index: getters.selectedIndex + 1 })
    },
    search ({ commit, state }) {
      const query = state.queryInput
      commit('setQuery', { query })
    },
    setScrollTop ({ commit, state }, { scrollTop }) {
      const history = {
        ...state.histories[state.historyIndex],
        scrollTop
      }
      commit('setHistory', { history, index: state.historyIndex })
    },
    changeSortKey ({ commit, dispatch, getters, rootState }, { sortKey }) {
      let sortDescending = false
      if (getters.sortOption.key === sortKey) {
        sortDescending = !getters.sortOption.descending
      }
      const sortOption = { key: sortKey, descending: sortDescending }
      commit('setSortOption', { sortOption, key: rootState.directory })
      dispatch('sort')
    },
    sort ({ commit, getters, state }) {
      const items = state.items.concat().sort((a, b) => {
        let result = 0
        const key = getters.sortOption.key
        if (a[key] > b[key]) {
          result = 1
        } else if (a[key] < b[key]) {
          result = -1
        }
        if (result === 0) {
          if (a.name > b.name) {
            result = 1
          } else if (a.name < b.name) {
            result = -1
          }
        }
        result = sortReversed[getters.sortOption.key] ? -1 * result : result
        return getters.sortOption.descending ? -1 * result : result
      })
      commit('setItems', { items })
    },
    action ({ commit, dispatch, state }, { filepath }) {
      const file = new File(filepath)
      if (file.isDirectory()) {
        dispatch('changeDirectory', { dirpath: file.path })
      } else {
        dispatch('showViewer', { filepath: file.path })
      }
    },
    showViewer ({ dispatch }, { filepath }) {
      const file = new File(filepath)
      if (file.isDirectory()) {
        const filepathes = File.listFiles(filepath, { recursive: true }).map(file => file.path)
        dispatch('viewer/show', { filepathes }, { root: true })
      } else {
        const filepathes = File.listFiles(file.parent.path).map(file => file.path)
        dispatch('viewer/show', { filepathes, currentFilepath: filepath }, { root: true })
      }
    }
  },
  mutations: {
    setItems (state, { items }) {
      state.items = items
    },
    setDirectoryInput (state, { directoryInput }) {
      state.directoryInput = directoryInput
    },
    setQuery (state, { query }) {
      state.query = query
    },
    setQueryInput (state, { queryInput }) {
      state.queryInput = queryInput
    },
    setSelectedFilepath (state, { selectedFilepath }) {
      state.selectedFilepath = selectedFilepath
    },
    setHistory (state, { history, index }) {
      state.histories = [
        ...state.histories.slice(0, index),
        history,
        ...state.histories.slice(index + 1, state.histories.length)
      ]
    },
    setHistories (state, { histories }) {
      state.histories = histories
    },
    setHistoryIndex (state, { historyIndex }) {
      state.historyIndex = historyIndex
    },
    setSortOption (state, { sortOption, key }) {
      state.sortOptions = {
        ...state.sortOptions,
        [key]: sortOption
      }
    }
  },
  getters: {
    backDirectories (state) {
      return state.histories.slice(0, state.historyIndex).reverse().map(history => history.directory)
    },
    forwardDirectories (state) {
      return state.histories.slice(state.historyIndex + 1, state.histories.length).map(history => history.directory)
    },
    canBackDirectory (state) {
      return state.historyIndex > 0
    },
    canForwardDirectory (state) {
      return state.historyIndex < state.histories.length - 1
    },
    scrollTop (state) {
      return state.histories[state.historyIndex].scrollTop
    },
    sortOption (state) {
      return state.sortOptions[state.directory] || {
        key: 'name',
        descending: false
      }
    },
    filteredItems (state) {
      return state.items.concat().filter((file) => {
        return !state.query || file.name.toLowerCase().indexOf(state.query.toLowerCase()) > -1
      })
    },
    selectedIndex (state, getters) {
      return getters.filteredItems.findIndex((file) => {
        return getters.isSelected({ filepath: file.path })
      })
    },
    isSelected (state) {
      return ({ filepath }) => {
        return state.selectedFilepath === filepath
      }
    }
  }
}
