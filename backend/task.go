package main

type TaskCategory struct {
	Tasks map[string]*Task
}

var TaskLibrary = map[string]TaskCategory{
	"DSA": {
		Tasks: map[string]*Task{
			"counter": {
				ID:          "counter",
				Description: "Implement a Counter class with increment, decrement, and reset methods. The counter should start at 0.",
				Template: `class Counter {
  constructor() {
    // Initialize counter
  }

  increment() {
    // Increment counter by 1
  }

  decrement() {
    // Decrement counter by 1
  }

  reset() {
    // Reset counter to 0
  }

  getValue() {
    // Return current value
  }
}`,
			},
			"reverse-array": {
				ID:          "reverse-array",
				Description: "Implement a function that reverses an array in-place without using built-in reverse methods.",
				Template: `function reverseArray(arr) {
  // Reverse the array in-place
  // Return the reversed array
}`,
			},
			"two-sum": {
				ID:          "two-sum",
				Description: "Given an array of integers and a target sum, return indices of two numbers that add up to the target.",
				Template: `function twoSum(nums, target) {
  // Find two numbers that add up to target
  // Return their indices as an array
}`,
			},
		},
	},
	"OOPS": {
		Tasks: map[string]*Task{
			"stack": {
				ID:          "stack",
				Description: "Implement a Stack class with push, pop, peek, and isEmpty methods using object-oriented principles.",
				Template: `class Stack {
  constructor() {
    // Initialize stack
  }

  push(element) {
    // Add element to top of stack
  }

  pop() {
    // Remove and return top element
    // Return null if stack is empty
  }

  peek() {
    // Return top element without removing
    // Return null if stack is empty
  }

  isEmpty() {
    // Return true if stack is empty
  }

  size() {
    // Return number of elements
  }
}`,
			},
			"queue": {
				ID:          "queue",
				Description: "Implement a Queue class with enqueue, dequeue, front, and isEmpty methods.",
				Template: `class Queue {
  constructor() {
    // Initialize queue
  }

  enqueue(element) {
    // Add element to rear of queue
  }

  dequeue() {
    // Remove and return front element
    // Return null if queue is empty
  }

  front() {
    // Return front element without removing
    // Return null if queue is empty
  }

  isEmpty() {
    // Return true if queue is empty
  }

  size() {
    // Return number of elements
  }
}`,
			},
			"bank-account": {
				ID:          "bank-account",
				Description: "Create a BankAccount class with deposit, withdraw, and getBalance methods. Prevent overdrafts.",
				Template: `class BankAccount {
  constructor(initialBalance = 0) {
    // Initialize balance
  }

  deposit(amount) {
    // Add amount to balance
    // Return new balance
  }

  withdraw(amount) {
    // Subtract amount from balance
    // Prevent overdraft (balance < 0)
    // Return true if successful, false if insufficient funds
  }

  getBalance() {
    // Return current balance
  }
}`,
			},
		},
	},
}

func (r *Room) getDefaultTask() *Task {
	return &Task{
		ID:          "default",
		Description: "Complete the coding challenge",
		Template:    "// Start coding here\n",
	}
}
