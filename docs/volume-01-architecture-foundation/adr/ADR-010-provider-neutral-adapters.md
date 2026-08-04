# ADR-010: Provider-Neutral Adapter Interfaces

## Metadata

| Field       | Value                          |
|-------------|--------------------------------|
| ADR ID      | ADR-010                        |
| Ngày tạo    | 2026-07-23                     |
| Trạng thái  | Accepted                       |
| Tác giả     | Architecture Team              |
| Liên quan   | ADR-007, ADR-009               |

---

## Status

**Accepted** — Áp dụng cho tất cả AI provider integrations.

---

## Context

AiDiLam tích hợp nhiều AI providers: OpenAI, Anthropic, Google Vertex AI, AWS Bedrock, Azure OpenAI.
Mỗi provider có SDK riêng với API conventions, authentication, error handling khác nhau.

Vấn đề hiện tại:
- **Vendor lock-in**: Application gọi trực tiếp provider SDKs, tight coupling.
- **Switching cost**: Thay provider requires rewrite code across services.
- **Inconsistent errors**: Mỗi provider throw different exceptions.
- **Testing difficulty**: Mock provider-specific SDKs brittle khi SDK update.
- **Response divergence**: Mỗi provider format khác, consuming code parse riêng.

---

## Decision

1. **Provider-specific SDKs behind adapter interfaces** — Mỗi SDK wrapped trong adapter implementing common interface. Application chỉ interact với interface.
2. **Application depends on abstractions only** — Business logic không import provider SDKs. DI resolve adapter tại runtime.

```
Application Layer (depends on IAiModelAdapter only)
    ├── OpenAiAdapter  → [OpenAI SDK]
    ├── AnthropicAdapter → [Anthropic SDK]
    └── BedrockAdapter → [AWS SDK]
```

Core interface:
```typescript
interface IAiModelAdapter {
  generateText(req: TextGenerationRequest): Promise<TextGenerationResponse>;
  generateEmbedding(req: EmbeddingRequest): Promise<EmbeddingResponse>;
  analyzeImage(req: ImageAnalysisRequest): Promise<ImageAnalysisResponse>;
  streamText(req: TextGenerationRequest): AsyncIterable<TextChunk>;
}
interface IAdapterFactory {
  createAdapter(provider: string, config: ModelConfig): IAiModelAdapter;
}
```

---

## Alternatives

### Alternative 1: Direct SDK Usage
- Gọi SDKs trực tiếp. **Từ chối**: Vendor lock-in, high switching cost, inconsistent patterns.

### Alternative 2: Unified Third-Party Library (LangChain, LiteLLM)
- Library abstract providers. **Từ chối**: External dependency lớn, không control abstraction.

### Alternative 3: API Gateway Translation
- Gateway translate requests. **Từ chối**: Thêm latency, khó handle streaming responses.

---

## Consequences

### Tích cực
- Provider independence: switch bằng thay adapter, không change business logic.
- Testability: mock interface dễ, không cần mock complex SDKs.
- Consistent error handling qua common exception types. Uniform response format.
- Easy add new providers: implement interface, register factory, done.

### Tiêu cực
- Provider-specific features có thể không expose qua common interface.
- Mỗi provider cần adapter implementation riêng. Indirection harder to debug.
- Lowest common denominator risk khi interface design.

---

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Interface quá restrictive | Medium | Medium | Extension points, optional capabilities |
| Adapter bugs che giấu SDK errors | Medium | Medium | Comprehensive tests, error pass-through |
| SDK breaking changes | Medium | Low | Pin versions, integration tests |
| New provider không fit interface | Low | Medium | Interface evolution strategy |

---

## Validation

1. **Interface compliance**: Mỗi adapter pass cùng contract test suite.
2. **No direct imports**: Static analysis verify app không import provider SDKs.
3. **Swap test**: Switch adapter runtime → application continues correctly.
4. **Error normalization**: Provider errors → common error types consistently.
5. **Performance**: Adapter overhead < 2ms vs direct SDK usage.
6. **Streaming**: Consistent streaming behavior across all adapters.

---

## Rollback

1. Relax linting, cho phép direct SDK imports trong application code.
2. Replace adapter calls với direct SDK calls per service gradually.
3. Remove adapter layer, update DI container. Archive adapter code.
4. Timeline: 3-4 sprints do nhiều services depend on adapters.

**Lưu ý**: Rollback reintroduce vendor lock-in, future provider switches expensive.
