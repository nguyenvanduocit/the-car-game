---
description: principles reviews
---
Reviews the whole codebase to enforce the principles:

### 0. Evidence-Based Code - Masterpiece Quality (CRITICAL)
- **Every line of code must be a fully verified masterpiece**
- **NEVER assume APIs, functions, types, or methods exist based on general knowledge**
- **ALWAYS verify existence and correctness before writing code:**
  - Read actual library source code or TypeScript definitions
  - Check official documentation with WebFetch/WebSearch
  - Verify function signatures, parameter types, and return types
  - Sample actual usage examples from the library
  - Check node_modules for type definitions and implementation details
- **For external libraries (BabylonJS, Colyseus, etc.):**
  - Look up actual type definitions in node_modules/@types or package types
  - Find real examples in library documentation
  - Verify method names, properties, and their exact signatures
  - Don't guess parameter order or optional parameters
- **If you cannot verify something exists, either:**
  - Research it thoroughly first (WebFetch docs, read type files)
  - Ask the user for clarification
  - Use a different verified approach
- **Quality standard:** Every function call, type reference, and API usage must have evidence it's correct

### 1.  KISS - Simplicity Above All
- **Simplicity, readability, and maintainability are the top priorities**
- Write straightforward, obvious code that anyone can understand
- Avoid clever tricks, complex abstractions, or premature optimizations
- If you can't explain it simply, simplify the implementation

### 2. YAGNI (You Aren't Gonna Need It)
- **Don't build features, abstractions, or utilities until they're actually needed**
- Resist the temptation to add "future-proofing" code
- Wait for concrete use cases before creating abstractions
- Delete unused code immediately

### 3. DRY (Don't Repeat Yourself)
- **Eliminate duplication only when it improves clarity**
- Extract repeated logic into functions/components when you have 3+ occurrences
- Don't abstract too early - some duplication is acceptable during exploration
- Shared logic must have a clear, single purpose

### 4. Engineer are not always right (engineer is the user of Claude Code)
- Dont asume that engineer are always right, sometime, my requirement or direction is lack of context. you have to:
  - Verify entineer's request
  - Collecting context
  - Ensure that engineer's request is correct and complete
  - Ensure that engineer fully aware of the context and the requirements and what is going on

### 5. Iteration-First Development (marked as THE MOST IMPORTANT)
- Every change must be easy to iterate, modify, and evolve
- Write code that can be changed quickly without cascading effects
- Avoid tight coupling that makes iteration difficult
- Prefer small, incremental changes over large rewrites
- Design for fast feedback loops
- If a change is hard to iterate on, simplify it first
- Key question: "How easy would it be to change this tomorrow?"