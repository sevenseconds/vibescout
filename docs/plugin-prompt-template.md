# Plugin Generation Prompt Template

Use this template with Claude Code to generate VibeScout plugins for any framework or language.

## Prompt Template

Copy and paste the following prompt into Claude Code, then fill in the bracketed sections:

```
I want to create a VibeScout plugin for [FRAMEWORK_NAME]. Please help me implement this plugin.

## Framework Information

**Framework Name**: [FRAMEWORK_NAME] (e.g., Svelte, Angular, Laravel, Rails)

**Framework Type**: [framework_type] (e.g., Frontend framework, Backend framework, Full-stack framework)

**File Extensions**: [extensions] (e.g., .svelte, .component.ts, .blade.php)

**Official Documentation**: [documentation_url]

## What I Want to Extract

[Describe what framework-specific features you want to extract. Choose from below or add your own:

- Components/Pages/Views identification
- Routing patterns and route dependencies
- State management (stores, actions, reducers)
- Data fetching (API calls, queries, mutations)
- Framework-specific imports and dependencies
- Props/events/interfaces
- Directives or decorators
- Service/worker patterns
- Special file types (e.g., .blade.php, .twig)
- Metadata specific to the framework]

## Key Patterns to Look For

[List the key syntax patterns, functions, or decorators that are unique to this framework:

Example for Svelte:
- Components: .svelte files
- Reactive statements: $:
- Stores: import { writable } from 'svelte/store'
- Props: export let prop = value
- Events: createEventDispatcher

Example for Angular:
- Components: @Component decorator
- Services: @Injectable decorator
- Directives: @Directive decorator
- Modules: @NgModule decorator
- Dependency injection patterns in constructors]

## Example File

[Provide a small example file from the framework that shows typical usage:

```typescript
// Example for Angular component
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-user',
  templateUrl: './user.component.html',
  styleUrls: ['./user.component.css']
})
export class UserComponent {
  @Input() userId: string;
  userData: any;

  constructor(private userService: UserService) {
    this.loadUser();
  }

  loadUser() {
    this.userService.getUser(this.userId).subscribe(data => {
      this.userData = data;
    });
  }
}
```

## Plugin Metadata

**Plugin Name**: vibescout-plugin-[plugin-name]
**Priority**: [1-10, where 10 overrides built-in extractors]
**Should extend TypeScriptStrategy?**: [yes/no - if framework uses TS/JS syntax]

## Additional Context

[Any additional information about the framework that would help:
- Common file naming conventions
- Directory structure patterns
- Build system patterns
- Framework version considerations
- Special features or unique aspects]

---

Please create:
1. The plugin entry point (index.js)
2. The extractor implementation (src/[Framework]Extractor.js)
3. package.json with proper manifest
4. Test file with example test cases
5. README.md with usage examples
```

## Example: Svelte Plugin Prompt

Here's an example of how to fill out the template for Svelte:

```
I want to create a VibeScout plugin for Svelte. Please help me implement this plugin.

## Framework Information

**Framework Name**: Svelte
**Framework Type**: Frontend framework
**File Extensions**: .svelte
**Official Documentation**: https://svelte.dev/docs

## What I Want to Extract

- Component identification and naming
- Props declarations (export let)
- Reactive statements ($:)
- Stores usage (writable, readable, derived)
- Events (createEventDispatcher)
- Special Svelte directives (bind:, on:, transition:)
- Slots and named slots
- Top-level imports
- Lifecycle hooks (onMount, onDestroy, etc.)

## Key Patterns to Look For

- Components: .svelte files
- Props: export let propName = value;
- Reactive statements: $: variable = expression;
- Stores: import { writable, readable, derived } from 'svelte/store'
- Events: const dispatch = createEventDispatcher();
- Lifecycle: onMount, onDestroy, beforeUpdate, afterUpdate, tick
- Directives: bind:, on:, use:, class:, style:
- Slots: <slot> and <slot name="header">
- Compile-time directives: #if, #each, #await, #key

## Example File

```svelte
<script>
  export let title = "Default";
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { createEventDispatcher } from 'svelte';

  const count = writable(0);
  const dispatch = createEventDispatcher();

  $: doubled = $count * 2;

  onMount(() => {
    console.log('mounted');
  });
</script>

<h1>{title}</h1>
<p>Count: {$count}</p>
<p>Doubled: {doubled}</p>

<button on:click={() => $count++}>Increment</button>

<slot name="footer" />

<style>
  h1 { color: blue; }
</style>
```

## Plugin Metadata

**Plugin Name**: vibescout-plugin-svelte
**Priority**: 10
**Should extend TypeScriptStrategy?**: No, Svelte has its own syntax

## Additional Context

- Svelte 3 vs Svelte 4 vs Svelte 5 (runes) have different syntax
- Runes in Svelte 5: $state, $derived, $effect
- File-based routing in SvelteKit: +page.svelte, +layout.svelte, +server.js
- Actions directive: use:action
- Transitions: transition:, in:, out:, animate:
```

## Quick-Start Templates

### Frontend Framework Prompt

```
Create a VibeScout plugin for [FRAMEWORK] (a frontend framework).

Extract:
- Components/pages/views
- Props/events/state
- Routing and navigation
- Framework-specific imports
- Directives/decorators
- Lifecycle hooks

File extensions: [list extensions]
Framework docs: [documentation URL]
```

### Backend Framework Prompt

```
Create a VibeScout plugin for [FRAMEWORK] (a backend framework).

Extract:
- Controllers/routes/endpoints
- Models/schemas
- Services/repositories
- Middleware
- Request/response patterns
- Database queries
- Authentication/authorization patterns

File extensions: [list extensions]
Framework docs: [documentation URL]
```

### Template Engine Prompt

```
Create a VibeScout plugin for [TEMPLATE_ENGINE] (a template engine).

Extract:
- Template inheritance/includes
- Variables and filters
- Control structures (loops, conditionals)
- Custom tags/directives
- Translation strings
- Asset references

File extensions: [list extensions]
Framework docs: [documentation URL]
```

## Tips for Better Results

1. **Provide Real Examples**: Include actual code from the framework you're targeting
2. **Be Specific About Patterns**: List exact syntax patterns, function names, and decorators
3. **Mention Versions**: Note if there are differences between framework versions
4. **Include Edge Cases**: Mention any special cases or unique features
5. **Link to Docs**: Always include official documentation URLs
6. **Specify Priority**: Set priority (1-10) based on how much you want to override built-in extractors

## After Generation

Once Claude generates your plugin:

1. **Review the generated code** for accuracy
2. **Create test fixtures** from real framework files
3. **Test locally**:
   ```bash
   mkdir -p ~/.vibescout/plugins/my-plugin
   # Copy your plugin there
   vibescout plugin list
   vibescout index ./my-project
   ```
4. **Refine and iterate** based on test results
5. **Publish to npm** when ready

## Common Framework Patterns

### React/Next.js
- Components, hooks, props
- Routing (app dir vs pages)
- Server actions, API routes

### Vue/Nuxt
- SFC structure (.vue)
- Composition API vs Options API
- Composables, directives
- Nuxt file-based routing

### Svelte/SvelteKit
- Svelte components
- Reactive statements ($:)
- Stores, events, slots
- SvelteKit special files (+page.svelte)

### Angular
- Components, services, directives
- Decorators (@Component, @Injectable)
- Dependency injection
- Modules, lazy loading

### Laravel/PHP
- Controllers, models, views
- Blade templates
- Routes, middleware
- Eloquent relationships

### Rails/Ruby
- Controllers, models, views
- ERB templates
- Routes, concerns
- Active Record patterns
