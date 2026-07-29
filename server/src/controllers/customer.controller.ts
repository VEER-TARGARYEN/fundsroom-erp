import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { asyncHandler } from '../utils/asyncHandler'
import { AppError } from '../utils/AppError'
import { paginationMeta, toSkipTake } from '../schemas/common.schema'
import { param } from '../utils/http'
import type {
  CreateCustomerInput,
  ListCustomerQuery,
  UpdateCustomerInput,
} from '../schemas/customer.schema'

/** GET /api/customers — paginated, searchable, filterable list. */
export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
  const q = req.validatedQuery as ListCustomerQuery
  const where: Prisma.CustomerWhereInput = {}
  if (q.status) where.status = q.status
  if (q.type) where.type = q.type
  if (q.search) {
    where.OR = [
      { businessName: { contains: q.search, mode: 'insensitive' } },
      { contactPerson: { contains: q.search, mode: 'insensitive' } },
      { gstin: { contains: q.search, mode: 'insensitive' } },
    ]
  }

  const [data, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(q) }),
    prisma.customer.count({ where }),
  ])
  res.json({ data, pagination: paginationMeta(q.page, q.limit, total) })
})

/** GET /api/customers/:id */
export const getCustomer = asyncHandler(async (req: Request, res: Response) => {
  const customer = await prisma.customer.findUnique({
    where: { id: param(req, 'id') },
    include: { challans: { orderBy: { createdAt: 'desc' }, take: 20 } },
  })
  if (!customer) throw AppError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND')
  res.json({ data: customer })
})

/** POST /api/customers */
export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as CreateCustomerInput
  const customer = await prisma.customer.create({
    data: {
      ...input,
      followUpDate: input.followUpDate ? new Date(input.followUpDate) : null,
    },
  })
  res.status(201).json({ data: customer })
})

/** PATCH /api/customers/:id */
export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as UpdateCustomerInput
  const customer = await prisma.customer.update({
    where: { id: param(req, 'id') },
    data: {
      ...input,
      followUpDate:
        input.followUpDate === undefined ? undefined : input.followUpDate ? new Date(input.followUpDate) : null,
    },
  })
  res.json({ data: customer })
})
