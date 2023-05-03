import { BladeApi } from 'tweakpane'
import { BladeController, View } from '@tweakpane/core'

interface FPSGraph extends BladeApi<BladeController<View>> {
  begin(): void
  end(): void
}
// Debug

