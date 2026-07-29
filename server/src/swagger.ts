import path from 'node:path'
import swaggerJSDoc, { type Options } from 'swagger-jsdoc'

/**
 * OpenAPI 3 definition. Reusable models + the JWT security scheme live here;
 * per-operation detail lives in @openapi JSDoc on the route files.
 *
 * `apis` is resolved from __dirname so it works in dev (tsx → src/*.ts) and in
 * production (tsc → dist/*.js). `removeComments: false` in tsconfig keeps the
 * JSDoc alive in the emitted .js so the docs are not empty in production.
 */
const options: Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Fundsroom ERP + CRM API',
      version: '1.0.0',
      description:
        'Backend for the Fundsroom wholesale ERP: CRM, inventory, and sales challans ' +
        'with concurrency-safe stock deduction. Authenticate via POST /api/auth/login, ' +
        'then click **Authorize** and paste the access token.',
    },
    servers: [{ url: '/api', description: 'API base path' }],
    tags: [
      { name: 'Auth' },
      { name: 'Customers' },
      { name: 'Products' },
      { name: 'Stock Logs' },
      { name: 'Challans' },
      { name: 'AI' },
      { name: 'System' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'NOT_FOUND' },
                message: { type: 'string' },
                details: {},
              },
            },
          },
        },
        InsufficientStockError: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'INSUFFICIENT_STOCK' },
                message: { type: 'string' },
                details: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          productId: { type: 'string', format: 'uuid' },
                          sku: { type: 'string', nullable: true },
                          name: { type: 'string', nullable: true },
                          requested: { type: 'integer', example: 100 },
                          available: { type: 'integer', example: 58 },
                          reason: { type: 'string', example: 'INSUFFICIENT_STOCK' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        LoginInput: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'admin@fundsroom.in' },
            password: { type: 'string', example: 'Admin@123' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            tokenType: { type: 'string', example: 'Bearer' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                email: { type: 'string', format: 'email' },
                name: { type: 'string' },
                role: { type: 'string', enum: ['ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTS'] },
              },
            },
          },
        },
        CreateCustomerInput: {
          type: 'object',
          required: ['businessName', 'contactPerson', 'mobile'],
          properties: {
            businessName: { type: 'string', example: 'Acme Traders' },
            contactPerson: { type: 'string', example: 'Rahul Sharma' },
            mobile: { type: 'string', example: '9876543210' },
            email: { type: 'string', format: 'email' },
            gstin: { type: 'string', example: '27ABCDE1234F1Z5' },
            type: { type: 'string', enum: ['WHOLESALE', 'RETAIL'] },
            status: { type: 'string', enum: ['ACTIVE', 'LEAD', 'INACTIVE'] },
            notes: { type: 'string' },
            followUpDate: { type: 'string', example: '2026-08-04' },
            addressLine1: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            pincode: { type: 'string', example: '411001' },
          },
        },
        CreateProductInput: {
          type: 'object',
          required: ['sku', 'name', 'category', 'unitPrice', 'warehouseLocation'],
          properties: {
            sku: { type: 'string', example: 'ELEC-1001' },
            name: { type: 'string', example: 'USB-C Fast Charger 30W' },
            category: { type: 'string', example: 'Electronics' },
            unitPrice: { type: 'number', example: 649 },
            stockQuantity: { type: 'integer', example: 420 },
            minStock: { type: 'integer', example: 100 },
            warehouseLocation: { type: 'string', example: 'Mumbai Hub' },
          },
        },
        AdjustStockInput: {
          type: 'object',
          required: ['quantityChange', 'reason'],
          properties: {
            quantityChange: { type: 'integer', example: 150, description: 'Signed: +in / -out' },
            reason: { type: 'string', example: 'PO #PO-7781 received' },
          },
        },
        CreateChallanInput: {
          type: 'object',
          required: ['customerId', 'items'],
          properties: {
            customerId: { type: 'string', format: 'uuid' },
            date: { type: 'string', example: '2026-07-28' },
            items: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['productId', 'quantity'],
                properties: {
                  productId: { type: 'string', format: 'uuid' },
                  quantity: { type: 'integer', example: 40 },
                },
              },
            },
          },
        },
      },
    },
    // Require a bearer token by default; public routes override with `security: []`.
    security: [{ bearerAuth: [] }],
  },
  apis: [path.join(__dirname, 'routes', '*.{ts,js}')],
}

export const openapiSpec = swaggerJSDoc(options)
