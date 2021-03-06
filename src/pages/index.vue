<template>
  <v-container class="index" fluid pa-0>
    <div class="d-flex flex-column fill-height flex-grow-1 overflow-hidden">
      <explorer-toolbar
        class="flex-grow-0"
        :loading="state.loading"
        @click:back="handleClickBack"
        @click:forward="handleClickForward"
        @click:upward="handleClickUpward"
        @click:reload="handleClickReload"
        @click:home="handleClickHome"
        @change:location="handleChangeLocation"
        @change:history="handleChangeHistory"
      />
      <explorer-card
        class="flex-grow-0"
        :selected="state.selected"
        :query="state.query"
        @change:query="handleChangeQuery"
      />
      <component
        :is="component"
        :ref="componentRef"
        :items="state.items"
        :loading="state.loading"
        :selected="state.selected"
        :sort-by="state.sortBy"
        :sort-desc="state.sortDesc"
        class="flex-grow-1 overflow-hidden"
        @keydown.native="handleKeyDown"
        @click:header="handleClickHeader"
        @click:item="handleClickItem"
        @dblclick:item="handleDoubleClickItem"
        @contextmenu:item="handleContextMenuItem"
        @change:rating="handleChangeRating"
        @change:sort-option="handleChangeSortOption"
      />
    </div>
  </v-container>
</template>

<script lang="ts">
import path from 'path'
import { remote, MenuItemConstructorOptions } from 'electron'
import {
  defineComponent,
  computed,
  reactive,
  onMounted,
  onUnmounted,
  watch,
  ref,
  SetupContext,
} from '@nuxtjs/composition-api'
import { promisify } from '@fiahfy/worker-promisify'
import ExplorerTable from '~/components/ExplorerTable.vue'
import ExplorerGridList from '~/components/ExplorerGridList.vue'
import { File, Item } from '~/models'
import {
  explorerStore,
  historyStore,
  queryHistoryStore,
  ratingStore,
  settingsStore,
  favoriteStore,
} from '~/store'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Worker = require('~/workers/fetch-files.worker').default

const worker = promisify(new Worker())

export default defineComponent({
  setup(_props: unknown, context: SetupContext) {
    const state = reactive<{
      loading: boolean
      error: boolean
      data: Item[]
      items: Item[]
      selected?: Item
      sortBy: keyof Item
      sortDesc: boolean
      query: string
    }>({
      loading: false,
      error: false,
      data: [],
      items: [],
      selected: undefined,
      sortBy: 'name',
      sortDesc: false,
      query: '',
    })

    const component = computed(() =>
      explorerStore.listStyle === 'list' ? ExplorerTable : ExplorerGridList
    )
    const componentRef = computed(() =>
      explorerStore.listStyle === 'list' ? 'table' : 'gridList'
    )

    const table = ref<InstanceType<typeof ExplorerTable>>()
    const gridList = ref<InstanceType<typeof ExplorerGridList>>()

    const load = async () => {
      if (state.loading) {
        return
      }
      state.selected = undefined
      state.loading = true
      state.data = []
      try {
        const { data }: { data: File[] } = await worker.postMessage({
          dirPath: explorerStore.location,
        })
        state.data = data.map((file) => {
          return {
            ...file,
            rating: ratingStore.getRating(file.path),
          }
        })
      } catch (e) {
        state.error = true
      }
      state.loading = false
    }
    const move = async (location: string) => {
      if (state.loading) {
        return
      }
      await historyStore.push({ history: location })
      explorerStore.setLocation({ location })
      load()
    }
    const go = async (offset: number) => {
      if (state.loading) {
        return
      }
      const history = await historyStore.go({ offset })
      if (!history) {
        return
      }
      explorerStore.setLocation({ location: history })
      load()
    }
    const search = (query: string) => {
      queryHistoryStore.add({ history: query })
      state.query = query
    }
    const present = (item: Item) => {
      context.root.$eventBus.$emit('show-presentation', item)
    }
    const scrollInView = () => {
      table.value && table.value.scrollInView()
      gridList.value && gridList.value.scrollInView()
    }
    const focus = () => {
      table.value && table.value.focus()
      gridList.value && gridList.value.focus()
    }

    const handleClickBack = async () => {
      await go(-1)
    }
    const handleClickForward = async () => {
      await go(1)
    }
    const handleClickUpward = () => {
      const filePath = path.dirname(explorerStore.location)
      move(filePath)
    }
    const handleClickHome = () => {
      const filePath = remote.app.getPath('home')
      move(filePath)
    }
    const handleClickReload = () => {
      load()
    }
    const handleClickHeader = (header: { value: string }) => {
      state.sortDesc = state.sortBy === header.value ? !state.sortDesc : false
      state.sortBy = header.value as keyof Item
    }
    const handleClickItem = (item: Item) => {
      state.selected = item
    }
    const handleDoubleClickItem = (item: Item) => {
      if (item.directory) {
        move(item.path)
      } else {
        present(item)
      }
    }
    const handleContextMenuItem = (item: Item) => {
      state.selected = item
      let template: MenuItemConstructorOptions[] = [
        {
          label: 'View',
          click: () => present(item),
          accelerator: 'Enter',
        },
      ]
      if (item.directory) {
        template = [
          ...template,
          { type: 'separator' },
          {
            label: favoriteStore.isFavorite(item.path)
              ? 'Remove from Favorites'
              : 'Add to Favorites',
            click: () => favoriteStore.toggle({ filePath: item.path }),
          },
        ]
      }
      const text = window.getSelection()?.toString()
      if (text) {
        template = [
          ...template,
          { type: 'separator' },
          { role: 'copy' },
          {
            label: `Search "${text}"`,
            click: () => search(text),
            accelerator: 'CmdOrCtrl+F',
          },
        ]
      }
      context.root.$contextMenu.open(template)
    }
    const handleChangeLocation = (location: string) => {
      move(location)
    }
    const handleChangeQuery = (query: string) => {
      search(query)
    }
    const handleChangeHistory = (offset: number) => {
      go(offset)
    }
    const handleChangeSortOption = ({
      by,
      desc,
    }: {
      by: string
      desc: boolean
    }) => {
      state.sortBy = by as keyof Item
      state.sortDesc = desc
    }
    const handleChangeRating = (item: Item, rating: number) => {
      ratingStore.setRating({ rating, filePath: item.path })
      // update item
      state.items = state.items.map((current) =>
        current.path === item.path
          ? {
              ...current,
              rating,
            }
          : current
      )
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Enter':
          return state.selected && present(state.selected)
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowRight':
        case 'ArrowLeft': {
          e.preventDefault()
          let index = state.items.findIndex(
            (item) => item.path === state.selected?.path
          )
          if (explorerStore.listStyle === 'list') {
            switch (e.key) {
              case 'ArrowUp':
                index -= 1
                break
              case 'ArrowDown':
                index += 1
                break
            }
          } else if (gridList.value) {
            const cols = gridList.value.getColsInRow()
            let newIndex = -1
            switch (e.key) {
              case 'ArrowUp':
                if (index - cols > -1) {
                  newIndex = index - cols
                }
                break
              case 'ArrowDown':
                if (index + cols < state.items.length) {
                  newIndex = index + cols
                }
                break
              case 'ArrowLeft':
                if (index % cols > 0) {
                  newIndex = index - 1
                }
                break
              case 'ArrowRight':
                if (index % cols < cols - 1) {
                  newIndex = index + 1
                }
                break
            }
            if (gridList.value.isRendered(newIndex)) {
              index = newIndex
            }
          }
          index = Math.min(Math.max(index, 0), state.items.length - 1)
          state.selected = state.items[index]
          scrollInView()
          break
        }
      }
    }

    watch(
      () => explorerStore.location,
      () => {
        state.query = ''
      }
    )

    watch(
      [
        () => state.data,
        () => state.sortBy,
        () => state.sortDesc,
        () => state.query,
        () => settingsStore.extensions,
      ],
      () => {
        table.value && table.value.setScrollTop(0)
        gridList.value && gridList.value.setScrollTop(0)
        state.items = state.data
          .concat()
          .filter(
            (file) => file.directory || settingsStore.isFileAvailable(file.path)
          )
          .sort((a, b) => {
            let result = 0
            const aValue = a[state.sortBy]
            const bValue = b[state.sortBy]
            if (aValue !== undefined && bValue !== undefined) {
              if (aValue > bValue) {
                result = 1
              } else if (aValue < bValue) {
                result = -1
              }
            } else {
              result = 0
            }
            return state.sortDesc ? -1 * result : result
          })
          .filter((item) => {
            return (
              !state.query ||
              item.name.toLowerCase().includes(state.query.toLowerCase())
            )
          })
      }
    )

    onMounted(() => {
      context.root.$eventBus.$on('change-location', move)
      context.root.$eventBus.$on('focus-explorer', focus)
    })

    onUnmounted(() => {
      context.root.$eventBus.$off('change-location', move)
      context.root.$eventBus.$off('focus-explorer', focus)
    })

    if (explorerStore.location) {
      load()
    } else {
      move(remote.app.getPath('home'))
    }

    return {
      state,
      component,
      componentRef,
      table,
      gridList,
      handleClickBack,
      handleClickForward,
      handleClickUpward,
      handleClickHome,
      handleClickReload,
      handleClickHeader,
      handleClickItem,
      handleDoubleClickItem,
      handleContextMenuItem,
      handleChangeLocation,
      handleChangeQuery,
      handleChangeHistory,
      handleChangeSortOption,
      handleChangeRating,
      handleKeyDown,
    }
  },
})
</script>
