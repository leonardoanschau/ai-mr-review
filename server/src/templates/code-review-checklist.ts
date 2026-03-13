/**
 * Code Review Checklist Template
 * Define aqui as regras que a IA deve seguir ao revisar código
 */

export interface ReviewRule {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'business' | 'architecture' | 'testing' | 'quality' | 'security' | 'performance';
  enabled: boolean;
}

export class CodeReviewChecklist {
  /**
   * ⚙️ CONFIGURAÇÃO DE REGRAS DE CODE REVIEW
   * 
   * EDITE AQUI para adicionar, remover ou modificar regras de review
   * 
   * Severity levels:
   * - critical: Problemas que DEVEM ser corrigidos
   * - high: Problemas importantes que precisam atenção
   * - medium: Melhorias recomendadas
   * - low: Sugestões opcionais
   */
  static getRules(): ReviewRule[] {
    return [
      // ========================================
      // 💼 REGRAS DE NEGÓCIO
      // ========================================
      {
        id: 'business-requirements',
        title: 'Validação de requisitos de negócio',
        description: `
Verificar se o código implementa corretamente os requisitos descritos na Tarefa/User Story.

**O que verificar:**
- ✅ Código resolve o problema descrito na tarefa?
- ✅ Implementa TODOS os critérios de aceite da User Story?
- ✅ Lógica de negócio está coerente com o objetivo?
- ✅ Nomenclatura reflete o domínio de negócio?
- ✅ Não há funcionalidades além do escopo (gold plating)?

**Exemplo:**

📋 **Tarefa:** "Criar validação de CPF antes de cadastrar cliente"

❌ **PROBLEMA - não implementa requisito:**
\`\`\`java
public void createCustomer(Customer customer) {
    // ❌ Não valida CPF conforme requisito
    customerRepository.save(customer);
}
\`\`\`

✅ **CORRETO - implementa requisito:**
\`\`\`java
public void createCustomer(Customer customer) {
    // ✅ Valida CPF conforme requisito
    if (!cpfValidator.isValid(customer.getCpf())) {
        throw new InvalidCpfException("CPF inválido");
    }
    customerRepository.save(customer);
}
\`\`\`

💡 **AÇÃO:** 
- Compare o código com a descrição da tarefa/US
- Identifique requisitos NÃO implementados
- Identifique código que vai ALÉM do escopo (se houver)
- Verifique se a solução resolve o problema original
`,
        severity: 'critical',
        category: 'business',
        enabled: true,
      },

      // ========================================
      // 🏗️ ARQUITETURA E DESIGN
      // ========================================
      {
        id: 'service-calling-service',
        title: 'Service chamando outro Service diretamente',
        description: `
⚠️ **REGRA CRÍTICA:** Service NUNCA pode chamar outro Service diretamente. Sempre usar Facade.

Verificar se um Service está chamando outro Service diretamente.

❌ PROIBIDO:
\`\`\`java
@Service
public class OrderService {
    @Autowired
    private CustomerService customerService; // ❌ NUNCA fazer isso!
    @Autowired
    private PaymentService paymentService; // ❌ PROIBIDO!
    
    public void createOrder() {
        customerService.getCustomer(); // ❌ Service chamando Service
        paymentService.process(); // ❌ Acoplamento direto
    }
}
\`\`\`

✅ OBRIGATÓRIO - Usar Facade Pattern:
\`\`\`java
@Component // Facade não é @Service
public class OrderFacade {
    private final OrderService orderService;
    private final CustomerService customerService;
    private final PaymentService paymentService;
    
    public OrderFacade(OrderService orderService,
                      CustomerService customerService,
                      PaymentService paymentService) {
        this.orderService = orderService;
        this.customerService = customerService;
        this.paymentService = paymentService;
    }
    
    public void processOrder(OrderRequest request) {
        // Facade orquestra os serviços
        var customer = customerService.getCustomer(request.getCustomerId());
        var order = orderService.createOrder(request);
        paymentService.processPayment(order);
    }
}
\`\`\`

**Regras de arquitetura:**
- ✅ Service pode chamar: Repository, Mapper, Validator, Utils
- ❌ Service NÃO pode chamar: outro Service
- ✅ Facade orquestra múltiplos Services
- ✅ Controller chama Facade (não Service diretamente)

💡 **AÇÃO OBRIGATÓRIA:** Criar uma classe Facade para orquestrar a comunicação entre Services.
`,
        severity: 'critical',
        category: 'architecture',
        enabled: true,
      },

      {
        id: 'sets-outside-service',
        title: 'Atribuições (sets) fora de classes de Service',
        description: `
Verificar se há atribuições (setters ou modificações de estado) sendo feitas fora de classes de Service.

❌ EVITAR (no Controller):
\`\`\`java
@RestController
public class OrderController {
    public void createOrder(Order order) {
        order.setStatus("PENDING"); // ❌ Lógica de negócio no Controller
        order.setCreatedDate(new Date());
    }
}
\`\`\`

✅ RECOMENDAR (no Service):
\`\`\`java
@Service
public class OrderService {
    public void createOrder(Order order) {
        order.setStatus("PENDING"); // ✅ Lógica no Service
        order.setCreatedDate(new Date());
    }
}
\`\`\`

💡 **AÇÃO:** Mover atribuições e lógica de negócio para classes de Service.
`,
        severity: 'high',
        category: 'architecture',
        enabled: true,
      },

      // ========================================
      // 🧪 TESTES
      // ========================================
      {
        id: 'missing-unit-tests',
        title: 'Métodos públicos novos sem testes unitários',
        description: `
Verificar se métodos públicos novos possuem testes unitários correspondentes.

Para cada método público novo, deve existir:
- ✅ Teste de caso de sucesso (happy path)
- ✅ Testes de casos de erro/exceção
- ✅ Testes de validação de entrada
- ✅ Testes de edge cases

Exemplo:
\`\`\`java
// Código
@Service
public class OrderService {
    public Order createOrder(OrderDTO dto) { // Método público NOVO
        // ...
    }
}

// Testes esperados
@Test
public void createOrder_whenValidDTO_shouldReturnOrder() { }

@Test
public void createOrder_whenInvalidDTO_shouldThrowException() { }

@Test
public void createOrder_whenDuplicateOrder_shouldThrowException() { }
\`\`\`

💡 **AÇÃO:** Criar testes unitários para métodos públicos novos ou modificados.
`,
        severity: 'high',
        category: 'testing',
        enabled: true,
      },

      // ========================================
      // 🛡️ QUALIDADE E SEGURANÇA
      // ========================================
      {
        id: 'null-pointer-exception',
        title: 'Possível NullPointerException',
        description: `
Verificar chamadas de métodos ou acesso a propriedades sem verificação de null.

❌ RISCO DE NPE:
\`\`\`java
public void processOrder(Order order) {
    String customerName = order.getCustomer().getName(); // ❌ getCustomer() pode ser null
    order.getItems().forEach(item -> {...}); // ❌ getItems() pode ser null
}
\`\`\`

✅ RECOMENDAR:
\`\`\`java
public void processOrder(Order order) {
    if (order.getCustomer() != null) {
        String customerName = order.getCustomer().getName();
    }
    
    // Ou usar Optional
    Optional.ofNullable(order.getCustomer())
        .map(Customer::getName)
        .ifPresent(name -> {...});
    
    // Ou validação prévia
    Objects.requireNonNull(order.getCustomer(), "Customer cannot be null");
}
\`\`\`

💡 **AÇÃO:** Adicionar validação de null ou usar Optional para evitar NPE.
`,
        severity: 'critical',
        category: 'quality',
        enabled: true,
      },

      {
        id: 'exception-handling',
        title: 'Tratamento inadequado de exceções',
        description: `
Verificar se exceções estão sendo tratadas adequadamente.

❌ EVITAR:
\`\`\`java
try {
    // código
} catch (Exception e) {
    e.printStackTrace(); // ❌ Não usar printStackTrace em produção
    // ou
    throw e; // ❌ Não adiciona contexto
}
\`\`\`

✅ RECOMENDAR:
\`\`\`java
try {
    // código
} catch (SpecificException e) {
    logger.error("Erro ao processar pedido: {}", orderId, e);
    throw new BusinessException("Erro ao processar pedido", e);
}
\`\`\`

💡 **AÇÃO:** Usar logger apropriado e adicionar contexto às exceções.
`,
        severity: 'medium',
        category: 'quality',
        enabled: true,
      },

      {
        id: 'sql-injection',
        title: 'Possível SQL Injection',
        description: `
Verificar concatenação de strings em queries SQL.

❌ VULNERÁVEL:
\`\`\`java
String query = "SELECT * FROM users WHERE id = " + userId; // ❌ SQL Injection
\`\`\`

✅ SEGURO:
\`\`\`java
String query = "SELECT * FROM users WHERE id = ?";
// Usar PreparedStatement ou JPA
\`\`\`

💡 **AÇÃO:** Usar PreparedStatement, JPA ou query parameters.
`,
        severity: 'critical',
        category: 'security',
        enabled: true,
      },

      // ========================================
      // ⚡ PERFORMANCE
      // ========================================
      {
        id: 'n-plus-one-query',
        title: 'Problema de N+1 queries',
        description: `
Verificar loops que fazem queries dentro (N+1 problem).

❌ PROBLEMA:
\`\`\`java
for (Order order : orders) {
    Customer customer = customerRepository.findById(order.getCustomerId()); // N queries
}
\`\`\`

✅ RECOMENDAR:
\`\`\`java
List<Long> customerIds = orders.stream()
    .map(Order::getCustomerId)
    .collect(Collectors.toList());
    
List<Customer> customers = customerRepository.findAllById(customerIds); // 1 query
\`\`\`

💡 **AÇÃO:** Usar fetch join ou buscar em lote.
`,
        severity: 'medium',
        category: 'performance',
        enabled: true,
      },

      {
        id: 'use-records',
        title: 'Classes DTO que deveriam ser Records',
        description: `
Detectar classes que são apenas containers de dados e podem ser substituídas por Java Records (Java 14+).

❌ PROBLEMA:
\`\`\`java
public class CustomerDTO {
    private final String name;
    private final String email;
    
    public CustomerDTO(String name, String email) {
        this.name = name;
        this.email = email;
    }
    
    public String getName() { return name; }
    public String getEmail() { return email; }
    
    @Override
    public boolean equals(Object o) { ... }
    @Override
    public int hashCode() { ... }
}
\`\`\`

✅ RECOMENDAR:
\`\`\`java
public record CustomerDTO(String name, String email) {
    // Validação no construtor compacto, se necessário
    public CustomerDTO {
        if (name == null || email == null) {
            throw new IllegalArgumentException("Name and email are required");
        }
    }
}
\`\`\`

💡 **AÇÃO:** Usar Records para classes DTO/Value Objects imutáveis. Records geram automaticamente: constructor, getters, equals(), hashCode(), toString().
`,
        severity: 'medium',
        category: 'quality',
        enabled: true,
      },

      {
        id: 'optional-return',
        title: 'Métodos que retornam null em vez de Optional',
        description: `
Detectar métodos que podem retornar null e não usam Optional<T>, tornando o código propenso a NullPointerException.

❌ PROBLEMA:
\`\`\`java
public Customer findCustomerByEmail(String email) {
    return customerRepository.findByEmail(email); // Pode retornar null
}

// No código cliente:
Customer customer = service.findCustomerByEmail("test@example.com");
customer.getName(); // 💥 NullPointerException se não houver cliente
\`\`\`

✅ RECOMENDAR:
\`\`\`java
public Optional<Customer> findCustomerByEmail(String email) {
    return Optional.ofNullable(customerRepository.findByEmail(email));
}

// No código cliente:
service.findCustomerByEmail("test@example.com")
    .map(Customer::getName)
    .orElse("Unknown");
\`\`\`

💡 **AÇÃO:** Usar Optional<T> para métodos que podem não retornar valor. Isso força o cliente a tratar explicitamente a ausência de valor.
`,
        severity: 'high',
        category: 'quality',
        enabled: true,
      },

      {
        id: 'functional-immutable',
        title: 'Código imperativo que pode ser funcional/imutável',
        description: `
Detectar código imperativo com loops e mutações que pode ser substituído por programação funcional (Stream API) e estruturas imutáveis.

❌ PROBLEMA:
\`\`\`java
List<String> activeCustomerNames = new ArrayList<>();
for (Customer customer : customers) {
    if (customer.isActive()) {
        activeCustomerNames.add(customer.getName().toUpperCase());
    }
}
\`\`\`

✅ RECOMENDAR:
\`\`\`java
List<String> activeCustomerNames = customers.stream()
    .filter(Customer::isActive)
    .map(Customer::getName)
    .map(String::toUpperCase)
    .collect(Collectors.toUnmodifiableList());
\`\`\`

**Benefícios:**
- ✅ Código mais declarativo e legível
- ✅ Menos propenso a bugs (sem mutações)
- ✅ Fácil de testar e paralelizar
- ✅ Composição de operações

💡 **AÇÃO:** Usar Stream API, map/filter/reduce, e coleções imutáveis sempre que possível.
`,
        severity: 'medium',
        category: 'quality',
        enabled: true,
      },

      {
        id: 'method-refactoring',
        title: 'Métodos novos que podem ser refatorados',
        description: `
Verificar se métodos novos (com ++) podem ser refatorados em métodos menores, mais legíveis e usando programação funcional.

**Critérios OBRIGATÓRIOS:**
- ✅ Método faz apenas UMA coisa (Single Responsibility)
- ✅ Nome do método é autoexplicativo
- ✅ **Método tem NO MÁXIMO 10 LINHAS** (excluindo assinatura e chaves)
- ✅ Não há lógica complexa aninhada (if dentro de if dentro de for)
- ✅ Usa programação funcional quando possível (Stream API, Optional, etc)

⚠️ **REGRA RÍGIDA:** Métodos com mais de 10 linhas DEVEM ser refatorados.

❌ EVITAR:
\`\`\`java
public void processOrder(Order order) {
    // Validação
    if (order != null) {
        if (order.getItems() != null && !order.getItems().isEmpty()) {
            // Cálculo
            double total = 0;
            for (OrderItem item : order.getItems()) {
                total += item.getPrice() * item.getQuantity();
            }
            order.setTotal(total);
            
            // Persistência
            if (total > 100) {
                order.setDiscount(total * 0.1);
            }
            orderRepository.save(order);
            
            // Notificação
            emailService.sendConfirmation(order.getCustomer().getEmail());
        }
    }
}
\`\`\`

✅ RECOMENDAR (com programação funcional):
\`\`\`java
public void processOrder(Order order) {
    validateOrder(order);
    calculateTotal(order);
    applyDiscount(order);
    saveOrder(order);
    notifyCustomer(order);
}

private void validateOrder(Order order) {
    Objects.requireNonNull(order, "Order cannot be null");
    if (order.getItems().isEmpty()) {
        throw new IllegalArgumentException("Order must have items");
    }
}

private void calculateTotal(Order order) {
    double total = order.getItems().stream()
        .mapToDouble(item -> item.getPrice() * item.getQuantity())
        .sum();
    order.setTotal(total);
}

private void applyDiscount(Order order) {
    Optional.of(order)
        .filter(o -> o.getTotal() > 100)
        .ifPresent(o -> o.setDiscount(o.getTotal() * 0.1));
}

private void saveOrder(Order order) {
    orderRepository.save(order);
}

private void notifyCustomer(Order order) {
    Optional.ofNullable(order.getCustomer())
        .map(Customer::getEmail)
        .ifPresent(emailService::sendConfirmation);
}
\`\`\`

**Benefícios:**
- 📖 Código mais legível e autodocumentado
- 🧪 Mais fácil de testar (métodos pequenos e isolados)
- 🔧 Mais fácil de manter e modificar
- ♻️ Maior reusabilidade dos métodos extraídos

💡 **AÇÃO:** 
1. Identifique responsabilidades distintas dentro do método
2. Extraia cada responsabilidade em um método privado bem nomeado
3. Use programação funcional (Stream API, Optional, lambdas)
4. Forneça o código refatorado usando o formato de suggestion do GitLab:

\`\`\`suggestion
// Código refatorado aqui
\`\`\`

Isso permitirá que o desenvolvedor aplique a sugestão com um clique.
`,
        severity: 'medium',
        category: 'quality',
        enabled: true,
      },

      // ========================================
      // 💡 ADICIONE SUAS REGRAS AQUI
      // ========================================

      {
        id: 'dto-validation',
        title: 'DTOs sem validações JSR-303',
        description: `
Detectar DTOs de request sem validações Bean Validation (JSR-303/380).

❌ PROBLEMA:
\`\`\`java
@Data
public class CreateOrderRequest {
    private String customerId; // Sem validações
    private List<OrderItem> items;
    private Double totalAmount;
}
\`\`\`

✅ RECOMENDAR:
\`\`\`java
@Data
public class CreateOrderRequest {
    @NotBlank(message = "Customer ID é obrigatório")
    @Size(max = 36, message = "Customer ID inválido")
    private String customerId;
    
    @NotNull(message = "Items são obrigatórios")
    @NotEmpty(message = "Pedido deve ter pelo menos 1 item")
    @Valid
    private List<OrderItem> items;
    
    @NotNull(message = "Total é obrigatório")
    @DecimalMin(value = "0.0", inclusive = false, message = "Total deve ser maior que zero")
    private Double totalAmount;
}
\`\`\`

💡 **AÇÃO:** Adicionar validações em todos os DTOs de request. Usar @Valid em cascata para objetos aninhados.
`,
        severity: 'high',
        category: 'quality',
        enabled: true,
      },

      {
        id: 'missing-transactional',
        title: 'Operações de escrita sem @Transactional',
        description: `
Detectar métodos que modificam dados sem controle transacional adequado.

❌ PROBLEMA:
\`\`\`java
@Service
public class OrderService {
    public void createOrder(Order order) {
        orderRepository.save(order);
        inventoryRepository.decreaseStock(order.getItems()); // Se falhar aqui?
        paymentService.processPayment(order); // E aqui?
    }
}
\`\`\`

✅ RECOMENDAR:
\`\`\`java
@Service
public class OrderService {
    @Transactional
    public void createOrder(Order order) {
        orderRepository.save(order);
        inventoryRepository.decreaseStock(order.getItems());
        paymentService.processPayment(order);
    }
    
    // Ou para MongoDB (sem suporte transacional tradicional)
    @Transactional // Spring Data MongoDB 2.1+
    public void createOrder(Order order) {
        // Operações serão agrupadas em uma sessão
    }
}
\`\`\`

💡 **AÇÃO:** Adicionar @Transactional em métodos que executam múltiplas operações de escrita. Para MongoDB, considerar usar sessões.
`,
        severity: 'high',
        category: 'architecture',
        enabled: true,
      },

      {
        id: 'missing-logging',
        title: 'Falta de logging em operações críticas',
        description: `
Verificar se operações críticas têm logging adequado para troubleshooting.

❌ PROBLEMA:
\`\`\`java
@Service
public class PaymentService {
    public void processPayment(Order order) {
        // Sem logs, difícil debugar em produção
        paymentGateway.charge(order.getTotal());
        order.setStatus(OrderStatus.PAID);
    }
}
\`\`\`

✅ RECOMENDAR:
\`\`\`java
@Slf4j
@Service
public class PaymentService {
    public void processPayment(Order order) {
        log.info("Processando pagamento para pedido: {}, valor: {}", 
                 order.getId(), order.getTotal());
        
        try {
            paymentGateway.charge(order.getTotal());
            order.setStatus(OrderStatus.PAID);
            log.info("Pagamento processado com sucesso: {}", order.getId());
        } catch (PaymentException e) {
            log.error("Erro ao processar pagamento do pedido: {}", order.getId(), e);
            throw e;
        }
    }
}
\`\`\`

**Níveis apropriados:**
- ✅ INFO: Fluxo principal, operações bem-sucedidas
- ✅ WARN: Situações anormais mas recuperáveis
- ✅ ERROR: Erros que exigem atenção
- ❌ EVITAR DEBUG/TRACE em produção sem controle

💡 **AÇÃO:** Adicionar logs em: integrações externas, operações críticas de negócio, pontos de falha conhecidos, início/fim de processos longos.
`,
        severity: 'medium',
        category: 'quality',
        enabled: true,
      },

      {
        id: 'magic-numbers-strings',
        title: 'Magic numbers ou strings hardcoded',
        description: `
Detectar valores literais sem contexto que deveriam ser constantes nomeadas.

❌ PROBLEMA:
\`\`\`java
public void processTemperature(Double temp) {
    if (temp < 2.0 || temp > 8.0) { // O que significam esses valores?
        sendAlert();
    }
}

if (task.getName().contains("geladeira")) { // String hardcoded
    // ...
}
\`\`\`

✅ RECOMENDAR:
\`\`\`java
public class TemperatureConstants {
    public static final Double FRIDGE_MIN_TEMP = 2.0;
    public static final Double FRIDGE_MAX_TEMP = 8.0;
    public static final String FRIDGE_KEYWORD = "geladeira";
}

public void processTemperature(Double temp) {
    if (temp < FRIDGE_MIN_TEMP || temp > FRIDGE_MAX_TEMP) {
        sendAlert();
    }
}

if (task.getName().contains(FRIDGE_KEYWORD)) {
    // ...
}
\`\`\`

**Exceções aceitáveis:**
- ✅ 0, 1, -1 em contextos óbvios (inicialização, comparação)
- ✅ Strings em mensagens de log descritivas
- ✅ Valores em testes unitários

💡 **AÇÃO:** Extrair valores literais para constantes nomeadas. Usar Enums quando houver conjunto fixo de valores.
`,
        severity: 'medium',
        category: 'quality',
        enabled: true,
      },

      {
        id: 'rest-api-standards',
        title: 'Endpoints REST não seguem convenções',
        description: `
Verificar se endpoints seguem padrões REST e retornam status HTTP apropriados.

❌ PROBLEMA:
\`\`\`java
@PostMapping("/createOrder") // Verbo na URL
public String create(@RequestBody Order order) { // Retorna String
    orderService.save(order);
    return "Success"; // Status 200 sempre, mesmo em erro
}

@GetMapping("/order") // Singular para coleção
public List<Order> getAll() { ... }
\`\`\`

✅ RECOMENDAR:
\`\`\`java
@PostMapping("/orders") // Substantivo plural, sem verbo
@ResponseStatus(HttpStatus.CREATED) // 201 para criação
public OrderResponse create(@RequestBody @Valid OrderRequest request) {
    var order = orderService.create(request);
    return orderMapper.toResponse(order);
}

@GetMapping("/orders") // Plural para coleção
public List<OrderResponse> getAll() { ... }

@GetMapping("/orders/{id}") // Singular para item específico
public OrderResponse getById(@PathVariable String id) { ... }

@PutMapping("/orders/{id}") // PUT para atualização completa
@ResponseStatus(HttpStatus.OK)
public OrderResponse update(@PathVariable String id, 
                           @RequestBody @Valid OrderRequest request) { ... }

@DeleteMapping("/orders/{id}")
@ResponseStatus(HttpStatus.NO_CONTENT) // 204 para delete
public void delete(@PathVariable String id) { ... }
\`\`\`

**Convenções:**
- ✅ Usar substantivos no plural (/orders, /customers)
- ✅ Evitar verbos na URL (POST /orders, não /createOrder)
- ✅ Status HTTP corretos (201 Created, 204 No Content, 404 Not Found)
- ✅ @Valid para validar requests
- ✅ DTOs separados (Request/Response)

💡 **AÇÃO:** Padronizar nomenclatura de endpoints e uso de status HTTP.
`,
        severity: 'medium',
        category: 'architecture',
        enabled: true,
      },

      {
        id: 'mutable-collections-return',
        title: 'Retornar coleções mutáveis expõe estado interno',
        description: `
Detectar métodos que retornam coleções mutáveis diretamente, permitindo modificação externa.

❌ PROBLEMA:
\`\`\`java
@Data
public class Order {
    private List<OrderItem> items = new ArrayList<>();
    
    public List<OrderItem> getItems() {
        return items; // Cliente pode fazer order.getItems().clear()!
    }
}
\`\`\`

✅ RECOMENDAR:
\`\`\`java
@Data
public class Order {
    private List<OrderItem> items = new ArrayList<>();
    
    public List<OrderItem> getItems() {
        return Collections.unmodifiableList(items);
        // Ou: return List.copyOf(items); (Java 10+)
    }
}

// Ou melhor ainda, usar Record (imutável por padrão):
public record Order(
    String id,
    List<OrderItem> items
) {
    public Order {
        items = List.copyOf(items); // Cópia imutável
    }
}

// Em Services:
public List<Customer> getActiveCustomers() {
    return customers.stream()
        .filter(Customer::isActive)
        .collect(Collectors.toUnmodifiableList()); // Imutável
}
\`\`\`

💡 **AÇÃO:** Retornar coleções imutáveis de getters. Usar List.copyOf(), Collections.unmodifiable*(), ou Collectors.toUnmodifiableList().
`,
        severity: 'medium',
        category: 'quality',
        enabled: true,
      },

      {
        id: 'field-injection',
        title: 'Field injection em vez de constructor injection',
        description: `
Detectar uso de @Autowired em campos (field injection) em vez de constructor injection.

❌ EVITAR:
\`\`\`java
@Service
public class OrderService {
    @Autowired
    private OrderRepository orderRepository; // Field injection
    
    @Autowired
    private PaymentService paymentService; // Difícil de testar
}
\`\`\`

✅ RECOMENDAR:
\`\`\`java
@Service
@RequiredArgsConstructor // Lombok gera constructor
public class OrderService {
    private final OrderRepository orderRepository;
    private final PaymentService paymentService;
    
    // Constructor injection:
    // - Facilita testes (pode passar mocks)
    // - Torna dependências explícitas
    // - Permite tornar campos final
    // - Evita NPE
}

// Ou explicitamente:
@Service
public class OrderService {
    private final OrderRepository orderRepository;
    private final PaymentService paymentService;
    
    public OrderService(OrderRepository orderRepository,
                       PaymentService paymentService) {
        this.orderRepository = orderRepository;
        this.paymentService = paymentService;
    }
}
\`\`\`

**Benefícios de constructor injection:**
- ✅ Dependências são obrigatórias e imutáveis (final)
- ✅ Fácil criar instância para testes
- ✅ Evita NullPointerException
- ✅ Torna dependências circulares óbvias

💡 **AÇÃO:** Usar constructor injection com @RequiredArgsConstructor ou construtor explícito.
`,
        severity: 'low',
        category: 'architecture',
        enabled: true,
      },
      
      // Exemplo de regra desabilitada:
      {
        id: 'todo-comments',
        title: 'Comentários TODO no código',
        description: `
Verificar se há comentários TODO que devem ser resolvidos antes do merge.

💡 **AÇÃO:** Resolver TODOs ou criar issues para tracking.
`,
        severity: 'low',
        category: 'quality',
        enabled: false, // Desabilitada - altere para true se quiser ativar
      },
    ];
  }

  /**
   * Gera o checklist formatado para a IA analisar
   */
  static generateChecklistPrompt(focus?: string): string {
    const rules = this.getRules().filter(rule => rule.enabled);
    
    // Filtrar por foco se especificado
    const filteredRules = focus && focus !== 'all'
      ? rules.filter(rule => rule.category === focus)
      : rules;

    let prompt = `🔍 **CODE REVIEW CHECKLIST**\n\n`;
    prompt += `Analise o código seguindo estas regras (${filteredRules.length} regras ativas):\n\n`;

    const categoriesMap = {
      business: '💼 REGRAS DE NEGÓCIO',
      architecture: '🏗️ ARQUITETURA',
      testing: '🧪 TESTES',
      quality: '🛡️ QUALIDADE',
      security: '🔒 SEGURANÇA',
      performance: '⚡ PERFORMANCE',
    };

    const groupedRules = filteredRules.reduce((acc, rule) => {
      if (!acc[rule.category]) {
        acc[rule.category] = [];
      }
      acc[rule.category].push(rule);
      return acc;
    }, {} as Record<string, ReviewRule[]>);

    Object.entries(groupedRules).forEach(([category, categoryRules]) => {
      prompt += `\n## ${categoriesMap[category as keyof typeof categoriesMap]}\n\n`;
      
      categoryRules.forEach((rule, index) => {
        const severityIcon = {
          critical: '🔴',
          high: '🟠',
          medium: '🟡',
          low: '🟢',
        }[rule.severity];

        prompt += `### ${index + 1}. ${severityIcon} ${rule.title}\n`;
        prompt += `**Severidade:** ${rule.severity.toUpperCase()}\n\n`;
        prompt += rule.description;
        prompt += `\n\n---\n\n`;
      });
    });

    prompt += `\n\n📝 **INSTRUÇÕES PARA A IA:**\n`;
    prompt += `1. ⚠️ **CRÍTICO**: Analise APENAS as linhas marcadas com \`+\` (código NOVO adicionado)\n`;
    prompt += `2. ❌ IGNORE linhas com \`-\` (código removido) e linhas de contexto (sem +/-)\n`;
    prompt += `3. Para cada problema encontrado, cite:\n`;
    prompt += `   - Nome do arquivo (caminho completo)\n`;
    prompt += `   - Número EXATO da linha (veja "L{número}:" no diff)\n`;
    prompt += `   - Regra violada do checklist\n`;
    prompt += `   - Sugestão de correção com exemplo de código\n`;
    prompt += `4. Priorize problemas por severidade (critical > high > medium > low)\n`;
    prompt += `5. Use os números de linha informados em "💬 Linhas comentáveis" para saber quais linhas podem receber comentários\n`;

    return prompt;
  }

  /**
   * Mapeia categoria de foco para categoria de regra
   */
  static mapFocusToCategory(focus?: string): string | undefined {
    const focusMap: Record<string, string> = {
      security: 'security',
      performance: 'performance',
      best_practices: 'quality',
      bugs: 'quality',
    };

    return focus ? focusMap[focus] : undefined;
  }
}
