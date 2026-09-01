<script setup lang="ts">
import { computed } from 'vue';
import { Dices } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useWorkflowStore } from '../../stores/workflowStore';

const workflowStore = useWorkflowStore();

const randomizeSeed = computed({
  get: () => workflowStore.sampler.randomizeSeed,
  set: (randomize: boolean) => {
    if (randomize) {
      workflowStore.sampler.seed = -1;
      workflowStore.sampler.randomizeSeed = true;
    } else {
      workflowStore.randomizeSeedValue();
    }
  }
});

const variationStrength = computed({
  get: () => [workflowStore.sampler.variationStrength],
  set: (value: number[]) => {
    if (value[0] !== undefined) {
      workflowStore.sampler.variationStrength = Number(value[0].toFixed(2));
    }
  }
});

function setSeedValue(value: string | number) {
  const seed = Number(value);
  if (!Number.isFinite(seed)) return;
  workflowStore.sampler.seed = seed;
  workflowStore.sampler.randomizeSeed = seed === -1;
}

function setVariationSeed(value: string | number) {
  const seed = Number(value);
  if (Number.isFinite(seed)) {
    workflowStore.sampler.variationSeed = Math.max(0, Math.trunc(seed));
  }
}

function randomizeVariationSeed() {
  workflowStore.sampler.variationSeed = Math.floor(
    Math.random() * 9007199254740991
  );
}
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div class="flex items-center justify-between">
      <div class="flex flex-col gap-0.5">
        <Label
          class="text-muted-foreground text-xs font-bold tracking-wider uppercase"
        >
          Sampling Seeds
        </Label>
        <p class="text-muted-foreground/80 text-xs">
          Control reproducibility and variation behavior.
        </p>
      </div>

      <div class="flex items-center gap-1.5">
        <Checkbox id="randomize-seed-checkbox" v-model="randomizeSeed" />
        <Label
          for="randomize-seed-checkbox"
          class="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-medium select-none"
        >
          Randomize
        </Label>
      </div>
    </div>

    <div class="flex items-center gap-1.5">
      <Input
        :model-value="workflowStore.sampler.seed"
        type="number"
        class="w-full font-mono text-xs"
        placeholder="Enter seed number..."
        @update:model-value="setSeedValue"
      />
      <Button
        variant="outline"
        size="icon"
        class="border-border bg-secondary text-foreground hover:bg-accent h-8 w-8 shrink-0"
        title="Roll New Random Seed"
        @click="workflowStore.randomizeSeedValue()"
      >
        <Dices
          class="text-muted-foreground hover:text-foreground h-3.5 w-3.5"
        />
      </Button>
    </div>

    <div
      class="border-border flex items-center justify-between border-t pt-2.5"
    >
      <div>
        <Label for="variation-seed-checkbox" class="text-xs font-medium">
          Variation Seed
        </Label>
      </div>
      <Checkbox
        id="variation-seed-checkbox"
        v-model="workflowStore.sampler.variationEnabled"
      />
    </div>

    <div
      class="flex flex-col gap-2.5"
      :class="{ 'opacity-50': !workflowStore.sampler.variationEnabled }"
    >
      <div class="flex items-center gap-1.5">
        <Input
          :model-value="workflowStore.sampler.variationSeed"
          type="number"
          min="0"
          class="font-mono text-xs"
          placeholder="Variation seed"
          aria-label="Variation seed"
          :disabled="!workflowStore.sampler.variationEnabled"
          @update:model-value="setVariationSeed"
        />
        <Button
          variant="outline"
          size="icon"
          class="border-border bg-secondary text-foreground hover:bg-accent h-8 w-8 shrink-0"
          title="Roll New Variation Seed"
          :disabled="!workflowStore.sampler.variationEnabled"
          @click="randomizeVariationSeed"
        >
          <Dices class="text-muted-foreground h-3.5 w-3.5" />
        </Button>
      </div>
      <div class="flex items-center justify-between">
        <Label class="text-muted-foreground text-xs">Variation Strength</Label>
        <span class="text-primary font-mono text-xs font-semibold">
          {{ workflowStore.sampler.variationStrength.toFixed(2) }}
        </span>
      </div>
      <Slider
        v-model="variationStrength"
        :min="0"
        :max="1"
        :step="0.01"
        aria-label="Variation strength"
        :disabled="!workflowStore.sampler.variationEnabled"
      />
    </div>
  </div>
</template>
