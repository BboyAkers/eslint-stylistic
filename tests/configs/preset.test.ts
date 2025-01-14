import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, it } from 'vitest'
import fs from 'fs-extra'
import { execa } from 'execa'
import fg from 'fast-glob'
import type { Linter } from 'eslint'
import type { StylisticCustomizeOptions } from '@stylistic/eslint-plugin'

const fixturesDir = fileURLToPath(new URL('fixtures', import.meta.url))

beforeAll(async () => {
  await fs.rm('_fixtures', { recursive: true, force: true })
})
afterAll(async () => {
  await fs.rm('_fixtures', { recursive: true, force: true })
})

runWithConfig('default', {})
runWithConfig('tab-quotes-semi', {
  indent: 'tab',
  quotes: 'double',
  semi: true,
})

runWithConfig('all', 'all-flat')

function runWithConfig(name: string, configs: StylisticCustomizeOptions | string, ...items: Linter[]) {
  it.concurrent(name, async ({ expect }) => {
    const from = resolve(fixturesDir, 'input')
    const output = resolve(fixturesDir, 'output', name)
    const target = resolve('_fixtures', name)

    await fs.copy(from, target, {
      filter: (src) => {
        return !src.includes('node_modules')
      },
    })
    await fs.writeFile(join(target, 'eslint.config.js'), `
// @eslint-disable
import stylistic from '@stylistic/eslint-plugin'
import parserTs from '@typescript-eslint/parser'
import parserVue from 'vue-eslint-parser'

export default [
  {
    files: ['**/*.?([cm])ts'],
    languageOptions: {
      parser: parserTs,
      parserOptions: {
        sourceType: 'module',
      }
    }
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: parserVue,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        extraFileExtensions: ['.vue'],
        parser: parserTs,
        sourceType: 'module',
      },
    }
  },
  ${
    typeof configs === 'string'
      ? `stylistic.configs['${configs}']`
      : `stylistic.configs.customize(${JSON.stringify(configs)})`
  },
  ...${JSON.stringify(items) ?? []},
]
  `)

    await execa('npx', ['eslint', '.', '--fix'], {
      cwd: target,
      stdio: 'pipe',
    })

    const files = await fg('**/*', {
      ignore: [
        'node_modules',
        'eslint.config.js',
      ],
      cwd: target,
    })

    await Promise.all(files.map(async (file) => {
      let content = await fs.readFile(join(target, file), 'utf-8')
      const source = await fs.readFile(join(from, file), 'utf-8')
      if (content === source)
        content = '// unchanged\n'
      await expect.soft(content.trim().replace(/\r\n/g, '\n'))
        .toMatchFileSnapshot(join(output, file).trim().replace(/\r\n/g, '\n'))
    }))
  }, 30_000)
}
