<script setup lang="ts">
import { PlusCircle } from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCounterStore } from '../stores/counter';

const counter = useCounterStore();
</script>

<template>
  <div class="flex flex-col items-center justify-center p-8 text-center">
    <h1 class="text-foreground text-2xl font-bold">About Page</h1>
    <p class="text-muted-foreground mt-2">
      This page demonstrates Vue Router and shared Pinia store state across
      routes with shadcn-vue and Reka UI.
    </p>

    <Card class="border-border bg-card mt-6 w-full max-w-md shadow-md">
      <CardHeader>
        <CardTitle class="text-foreground">Shared State</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="flex flex-col items-center gap-4 py-2">
          <div class="flex items-center gap-3">
            <Badge variant="secondary">
              Current Store Count: {{ counter.count }}
            </Badge>
            <Badge variant="default"> Double: {{ counter.doubleCount }} </Badge>
          </div>
          <Button
            class="bg-primary text-primary-foreground hover:bg-primary/90"
            @click="counter.increment"
          >
            <PlusCircle class="h-4 w-4" />
            <span>Increment from About Page</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
