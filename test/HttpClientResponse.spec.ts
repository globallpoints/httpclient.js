import nock from 'nock'
import moment from 'moment'
import { HttpClientBuilder, HttpClientInterceptors, HttpClientRetryStrategy } from '../src'

describe('HttpClientResponse', () => {
  const interceptors = HttpClientInterceptors.create()
    .useErrorInterceptor(err => {
      if (err.response) {
        switch (err.response.status) {
          case 401:
            return { message: 'its ok, let it pass' }
          case 404:
            throw new Error('404 error, shit!')
        }
      }
      throw new Error(err.message)
    })
    .useResponseInterceptor<any>(response => {
      if (response && response.return)
        return response.return
    })

  beforeEach(() => {
    nock('http://api.github.com')
      .get('/users/throw/401')
      .reply(401)

    nock('http://api.github.com')
      .get('/users/200')
      .reply(200, {
        success: true,
        return: {
          name: 'Bruno Mayer'
        },
        error: null
      })
  })

  it('should fetch and return 200 with a body', async () => {
    nock('http://api.github.com')
      .get('/users/bsmayer/repos')
      .reply(200, {
        name: 'Bruno Mayer',
        username: 'bsmayer',
        repos: []
      })

    const response = await HttpClientBuilder
      .create('http://api.github.com')
      .client()
      .path('users', 'bsmayer', 'repos')
      .get()
      .getResponse<any>()

    expect(response).toBeDefined()
    expect(response.name).toEqual('Bruno Mayer')
    expect(response.username).toEqual('bsmayer')
  })

  it('should intercept error and not throw', async () => {
    const interceptor = HttpClientInterceptors.create()
      .useErrorInterceptor(() => ({ message: 'let it pass' }))

    const response = await HttpClientBuilder
      .create('http://api.github.com')
      .useInterceptors(interceptor)
      .client()
      .path('users', 'throw', '401')
      .get()
      .getResponse<any>()

    expect(response).toBeDefined()
    expect(response.message).toEqual('let it pass')
  }, 15000)

  it('should intercept the error and throw', async () => {
    const interceptor = HttpClientInterceptors.create()
      .useErrorInterceptor(() => {
        throw new Error('we should catch this error')
      })

    await HttpClientBuilder
      .create('http://api.github.com')
      .useInterceptors(interceptor)
      .client()
      .path('users', 'throw', '401')
      .get()
      .getResponse<any>()
      .catch(err => expect(err.message).toEqual('we should catch this error'))
  }, 15000)

  it('should intercept the response and get the main object', async () => {
    const response = await HttpClientBuilder
      .create('http://api.github.com')
      .useInterceptors(interceptors)
      .client()
      .path('users', '200')
      .get()
      .getResponse<any>()

    expect(response.name).toEqual('Bruno Mayer')
  })

  it('should retry 3 times before intercepting the error', async () => {
    const interceptors = HttpClientInterceptors.create()
      .useErrorInterceptor(() => {
        throw new Error('we should catch this error')
      })

    const retry = HttpClientRetryStrategy.create()
      .attempt(3)
      .interval(1000)
      .useExponentialStrategy(false)

    const builder = HttpClientBuilder.create('http://api.github.com')
      .useInterceptors(interceptors)
      .useRetryStrategy(retry)

    const before = moment()
    await builder.client()
      .path('users', 'throw', '401')
      .get()
      .getResponse<any>()
      .catch(err => {
        const later = moment()
        expect(err.message).toEqual('we should catch this error')
        expect(later.diff(before, 'seconds')).toBeGreaterThanOrEqual(2)
      })
  }, 5000)
})
